import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import * as THREE from 'three';

import type { VrmBackend } from '../backends/vrm';
import { mascotRegistry } from '../MascotBackend';

import { ClickClassifier, PatDetector } from './gestures';
import { react } from './reactions';
import { pickRegion, type BodyRegion } from './regions';
import { interactionSettings } from './settings';
import { alphaSpans, rectsKey, type Rect } from './shape';

const DRAG_THRESHOLD = 5;
const ALPHA_HIT = 24; // 0..255

function vrmBackend(): VrmBackend | null {
  const b = mascotRegistry.current() as VrmBackend | null;
  return b && typeof b.colliders === 'function' ? b : null;
}

/**
 * 看板娘桌面互动（位于 R3F Canvas 内）：
 * - 逐像素命中：读取画布 alpha（+ 骨骼碰撞体兜底），UI 元素视为命中 → 主进程切换点击穿透
 * - 区域悬停 / 摸头 / 单击 / 双击反应；全局光标视线跟随
 * - 按住拖动窗口（主进程移动窗口并估计速度，松手抛出）
 * - 上报角色在窗口内的包围盒（主进程以此判定落地 / 撞墙）
 */
const MascotInteractionLayer: FC = () => {
  const { camera, gl } = useThree();
  const st = useRef({
    cursor: { x: -1, y: -1, inside: false, fresh: false },
    hit: null as boolean | null,
    missStreak: 0,
    hover: null as BodyRegion | null,
    down: null as {
      x: number;
      y: number;
      sx: number;
      sy: number;
      region: BodyRegion | null;
    } | null,
    dragging: false,
    lastGeom: '',
    geomAt: 0,
    shapeAt: 0,
    lastShape: '',
  });
  const ray = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const pat = useRef(new PatDetector());
  const pixel = useRef(new Uint8Array(4 * 25));
  const shapeBuf = useRef(new Uint8Array(0));

  const canvas = gl.domElement;

  /** 窗口坐标 → 区域（射线 vs 骨骼碰撞体） */
  const pickAt = (x: number, y: number): BodyRegion | null => {
    const b = vrmBackend();
    if (!b) return null;
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    ndc.current.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.current.setFromCamera(ndc.current, camera);
    const { origin, direction } = ray.current.ray;
    return pickRegion(origin, direction, b.colliders())?.region ?? null;
  };

  /** 画布在 (x, y) 附近 5×5 像素内的最大 alpha */
  const alphaAt = (x: number, y: number): number => {
    const r = canvas.getBoundingClientRect();
    const ctx = gl.getContext();
    const sx = canvas.width / Math.max(1, r.width);
    const sy = canvas.height / Math.max(1, r.height);
    const px = Math.round((x - r.left) * sx);
    const py = Math.round(canvas.height - (y - r.top) * sy);
    if (px < 2 || py < 2 || px >= canvas.width - 2 || py >= canvas.height - 2) return 0;
    try {
      ctx.readPixels(px - 2, py - 2, 5, 5, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel.current);
    } catch {
      return 0;
    }
    let a = 0;
    for (let i = 3; i < pixel.current.length; i += 4) a = Math.max(a, pixel.current[i]);
    return a;
  };

  const hitTest = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
    const el = document.elementFromPoint(x, y);
    // 工具栏 / 气泡 / 弹窗等 UI：不是画布本身、也不是画布的祖先容器
    if (el && el !== canvas && !el.contains(canvas)) return true;
    return alphaAt(x, y) >= ALPHA_HIT || pickAt(x, y) !== null;
  };

  useEffect(() => {
    const s = st.current;
    const api = window.electronAPI?.mascotWindow;
    interactionSettings.push();
    const classifier = new ClickClassifier((region, kind) => react(kind, region));

    const offCursor = api?.onCursor((p) => {
      s.cursor = { x: p.x, y: p.y, inside: p.inside, fresh: true };
    });
    const offBody = api?.onBody((m) => vrmBackend()?.setBodyMotion(m));
    const offEvt = api?.onPhysicsEvent((e) => {
      const b = vrmBackend();
      document.documentElement.dataset.mascotPhysics = e.type;
      if (e.type === 'land' || e.type === 'bounce') {
        if (e.speed > 250) b?.land(e.speed);
        if (e.type === 'land' && e.speed > 900) react('land', 'any', 4000);
      } else if (e.type === 'grab') {
        react('grab', 'any', 3000);
      } else if (e.type === 'wall' && e.speed > 900) {
        react('wall', 'any', 3000);
      }
    });

    const onMove = (e: PointerEvent) => {
      s.cursor = { x: e.clientX, y: e.clientY, inside: true, fresh: true };
      if (s.dragging) api?.dragMove(e.screenX, e.screenY);
      if (s.down && !s.dragging) {
        if (Math.hypot(e.clientX - s.down.x, e.clientY - s.down.y) > DRAG_THRESHOLD) {
          s.dragging = true;
          api?.dragStart(s.down.sx, s.down.sy);
          document.documentElement.dataset.mascotDragging = '1';
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.target !== canvas) return;
      if (!hitTest(e.clientX, e.clientY)) return;
      s.down = {
        x: e.clientX,
        y: e.clientY,
        sx: e.screenX,
        sy: e.screenY,
        region: pickAt(e.clientX, e.clientY),
      };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件没有真实指针 */
      }
    };
    const finish = (click: boolean) => {
      if (s.dragging) {
        api?.dragEnd();
        s.dragging = false;
        document.documentElement.dataset.mascotDragging = '0';
      } else if (click && s.down) {
        classifier.click(s.down.region ?? 'body');
      }
      s.down = null;
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 0) finish(true);
    };
    const onCancel = () => finish(false);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    return () => {
      offCursor?.();
      offBody?.();
      offEvt?.();
      classifier.dispose();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      if (s.dragging) api?.dragEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvas / camera 在画布生命周期内不变
  }, [canvas]);

  const tmp = useRef(new THREE.Vector3());

  useFrame((state) => {
    const s = st.current;
    const b = vrmBackend();
    const api = window.electronAPI?.mascotWindow;
    if (!b) return;
    const cfg = interactionSettings.get();
    const now = state.clock.elapsedTime;
    const rect = canvas.getBoundingClientRect();
    const toScreen = (p: { x: number; y: number; z: number }) => {
      tmp.current.set(p.x, p.y, p.z).project(camera);
      return {
        x: rect.left + ((tmp.current.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - tmp.current.y) / 2) * rect.height,
      };
    };

    // ---- 包围盒上报（主进程物理用）----
    if (now - s.geomAt > 0.5) {
      s.geomAt = now;
      let l = Infinity;
      let r = -Infinity;
      let t = Infinity;
      let btm = -Infinity;
      const cols = b.colliders();
      for (const c of cols) {
        const p = toScreen(c.center);
        const edge = toScreen({ x: c.center.x + c.radius, y: c.center.y, z: c.center.z });
        const rad = Math.abs(edge.x - p.x);
        l = Math.min(l, p.x - rad);
        r = Math.max(r, p.x + rad);
        t = Math.min(t, p.y - rad);
        btm = Math.max(btm, p.y + rad * 0.4); // 脚底：脚骨球体下沿附近
      }
      if (cols.length && Number.isFinite(l)) {
        const box = {
          left: Math.round(Math.max(0, l)),
          right: Math.round(Math.min(window.innerWidth, r)),
          top: Math.round(Math.max(0, t)),
          bottom: Math.round(Math.min(window.innerHeight, btm)),
        };
        const key = `${box.left},${box.right},${box.top},${box.bottom}`;
        // 滞回：待机动画会让包围盒每帧微动，只有变化 ≥ 8px 才上报，避免窗口跟着抖
        const prev = s.lastGeom ? s.lastGeom.split(',').map(Number) : null;
        const changed =
          !prev ||
          Math.max(
            Math.abs(prev[0] - box.left),
            Math.abs(prev[1] - box.right),
            Math.abs(prev[2] - box.top),
            Math.abs(prev[3] - box.bottom),
          ) >= 8;
        if (changed && !s.dragging && !s.down) {
          s.lastGeom = key;
          api?.setGeometry(box);
          document.documentElement.dataset.mascotBox = key;
        }
      }
    }

    const c = s.cursor;
    // ---- 视线：全局光标（或窗口内光标）相对头部 ----
    const headW = b.headWorld();
    if (headW && (cfg.globalLook || c.inside) && c.x > -1e5) {
      const h = toScreen(headW);
      const dx = c.x - h.x;
      const dy = c.y - h.y;
      b.lookAt(Math.max(-1, Math.min(1, dx / 450)), Math.max(-1, Math.min(1, -dy / 450)));
    } else if (!cfg.globalLook && !c.inside) {
      b.lookAt(0, 0);
    }

    // ---- Linux：窗口形状 = 角色 alpha 扫描线 + UI 矩形（≈4Hz）----
    if (api?.platform === 'linux' && now - s.shapeAt > 0.25 && !s.dragging) {
      s.shapeAt = now;
      let rects: Rect[] = [];
      if (cfg.clickThrough && !document.querySelector('[role="dialog"]')) {
        const ctx = gl.getContext();
        const w = canvas.width;
        const h = canvas.height;
        if (shapeBuf.current.length !== w * h * 4) shapeBuf.current = new Uint8Array(w * h * 4);
        try {
          ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, shapeBuf.current);
          rects = alphaSpans(shapeBuf.current, w, h, {
            scale: rect.width / Math.max(1, w),
            offsetX: rect.left,
            offsetY: rect.top,
          });
        } catch {
          rects = [];
        }
        if (rects.length) {
          document.querySelectorAll<HTMLElement>('[data-mascot-ui]').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0)
              rects.push({ x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 });
          });
        }
      }
      const key = rectsKey(rects);
      if (key !== s.lastShape) {
        s.lastShape = key;
        api.setShape(rects);
      }
    }

    if (!c.fresh) return;
    c.fresh = false;

    // ---- 命中测试 → 点击穿透 ----
    const hit = s.dragging || hitTest(c.x, c.y);
    // 命中立即生效；未命中连续两次再穿透，避免边缘抖动
    s.missStreak = hit ? 0 : s.missStreak + 1;
    const effective = hit || s.missStreak < 2;
    if (effective !== s.hit) {
      s.hit = effective;
      api?.setHit(effective);
      document.documentElement.dataset.mascotHit = effective ? '1' : '0';
    }

    // ---- 区域悬停 / 摸头 ----
    const region = hit && !s.dragging ? pickAt(c.x, c.y) : null;
    if (region !== s.hover) {
      s.hover = region;
      pat.current.reset();
      document.documentElement.dataset.mascotHover = region ?? '';
      if (region) react('hover', region, 8000);
    }
    if (region === 'head' && pat.current.feed(c.x, performance.now())) react('pat', 'head', 1500);
  });

  return null;
};

export default MascotInteractionLayer;
