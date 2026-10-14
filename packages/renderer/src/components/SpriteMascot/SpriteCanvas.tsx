import { perfMark } from '@nomi-ai/ui';
import React, { useEffect, useRef, useState } from 'react';

import {
  createSpriteBackend,
  loadSpriteManifest,
  type SpriteBackend,
} from '../../mascot/backends/sprite';
import {
  drawRig,
  paintRigFrame,
  RigAnimator,
  RIG_LAYERS,
  rigBodyBox,
  rigHeadBox,
  rigTransform,
  type RigImages,
  type RigManifest,
} from '../../mascot/layeredRig';
import { mascotRegistry } from '../../mascot/MascotBackend';
import { characterBox } from '../../mascot/spriteLayout';

import MascotInteractionLayerLite, { type SpriteGeometry } from './InteractionLite';

export interface SpriteCanvasProps {
  /** URL to manifest.json */
  manifestPath: string;
  className?: string;
  style?: React.CSSProperties;
  transparent?: boolean;
}

/**
 * 2D expression-swapped mascot (soft PNG or pixel pet). No Live2D / no three.js.
 */
export const SpriteCanvas: React.FC<SpriteCanvasProps> = ({
  manifestPath,
  className = '',
  style,
  transparent = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backendRef = useRef<SpriteBackend | null>(null);
  const imgs = useRef(new Map<string, HTMLImageElement>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styleKind, setStyleKind] = useState('soft');
  const styleKindRef = useRef('soft');
  const rigRef = useRef<RigManifest | null>(null);
  const animRef = useRef<RigAnimator | null>(null);
  const rigImgs = useRef<RigImages>(new Map());
  const geometry = useRef<SpriteGeometry>({ head: null, body: null });

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;
    let raf = 0;
    setReady(false);
    setError(null);
    loadSpriteManifest(manifestPath)
      .then(({ manifest, baseUrl }) => {
        if (cancelled) return;
        const backend = createSpriteBackend(manifest, baseUrl);
        backendRef.current = backend;
        detach = mascotRegistry.attach(backend);
        if (process.env.NODE_ENV === 'development') {
          // dev-only handle for visual checks / screenshots over CDP
          (globalThis as { __nomiMascot?: SpriteBackend }).__nomiMascot = backend;
        }
        const sk = manifest.style || 'soft';
        styleKindRef.current = sk;
        setStyleKind(sk);
        if (manifest.rig) {
          const rig = manifest.rig;
          rigRef.current = rig;
          animRef.current = new RigAnimator();
          if (process.env.NODE_ENV === 'development') {
            // dev-only: deterministic offscreen rendering for demo videos
            (globalThis as { __nomiRig?: unknown }).__nomiRig = {
              rig,
              imgs: rigImgs.current,
              RigAnimator,
              paintRigFrame,
              drawRig,
            };
          }
          const dir = rig.dir ?? 'layers/';
          const rigLoads = RIG_LAYERS.filter((n) => rig.layers[n]).map(
            (n) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                  rigImgs.current.set(n, img);
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = `${baseUrl}${dir}${n}.png`;
              }),
          );
          return Promise.all(rigLoads).then(() => {
            if (cancelled) return;
            if (!rigImgs.current.has('body') || !rigImgs.current.has('head')) {
              throw new Error('rig layers missing');
            }
            setReady(true);
            document.documentElement.dataset.mascotModel = manifest.id;
            document.documentElement.dataset.mascotRig = 'layered';
            perfMark('mascot-model-loaded');
            perfMark('sprite-model-loaded', manifest.id);
          });
        }
        // preload
        const files = new Set([
          ...Object.values(manifest.expressions),
          manifest.blink,
          manifest.mouthOpen,
        ]);
        const loads = [...files].filter(Boolean).map(
          (f) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                imgs.current.set(`${baseUrl}${f}`, img);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = `${baseUrl}${f}`;
            }),
        );
        return Promise.all(loads).then(() => {
          if (cancelled) return;
          setReady(true);
          document.documentElement.dataset.mascotModel = manifest.id;
          perfMark('mascot-model-loaded');
          perfMark('sprite-model-loaded', manifest.id);
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    rigRef.current = null;
    animRef.current = null;
    rigImgs.current = new Map();
    const reduceMq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let last = performance.now();
    let activeAt = last;
    let lastSig = '';
    const tick = (now: number) => {
      // pause entirely while the window is hidden / minimised (resumed by visibilitychange)
      if (document.hidden) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
      const reduced = !!reduceMq?.matches;
      // reduced motion: 30fps is plenty for blink + lip sync. Idle rig (no speech, gesture or
      // cursor movement for 2 s) also drops to ~30fps: slow noise/breath motion stays smooth
      // and CPU use halves.
      const idle = !!rigRef.current && now - activeAt > 2000;
      if ((reduced || idle) && now - last < 30) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const backend = backendRef.current;
      const canvas = canvasRef.current;
      if (!backend || !canvas) return;
      backend.update(dt, now / 1000);
      const frame = backend.snapshot();
      const sig = `${frame.talking}|${frame.expression}|${frame.gesture?.id}|${frame.thinking}|${frame.lookX.toFixed(2)}|${frame.lookY.toFixed(2)}`;
      if (sig !== lastSig || frame.mouth > 0.02) {
        lastSig = sig;
        activeAt = now;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const rig = rigRef.current;
      const anim = animRef.current;
      if (rig && anim) {
        const pose = anim.step(dt, now / 1000, {
          expression: frame.expression,
          mouth: frame.mouth,
          talking: frame.talking,
          blink: frame.blinkOpacity,
          lookX: frame.lookX,
          lookY: frame.lookY,
          reducedMotion: reduced,
          gesture: frame.gesture,
          thinking: frame.thinking,
        });
        const box = characterBox(w, h);
        paintRigFrame(ctx, rig, rigImgs.current, pose, w, h, box);
        const view = rigTransform(rig, w, h, box);
        const r = canvas.getBoundingClientRect();
        const shift = (b: { left: number; right: number; top: number; bottom: number } | null) =>
          b && {
            left: b.left + r.left,
            right: b.right + r.left,
            top: b.top + r.top,
            bottom: b.bottom + r.top,
          };
        geometry.current = {
          head: shift(rigHeadBox(rig, rigImgs.current, pose, view)),
          body: shift(rigBodyBox(rig, rigImgs.current, view, w, h)),
        };
        return;
      }
      const img = imgs.current.get(frame.expressionUrl);
      if (!img) return;
      const cb = characterBox(w, h);
      const scale = Math.min((cb.w * 0.85) / img.width, (cb.h * 0.9) / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const lookOffX = frame.lookX * 8;
      const lookOffY = -frame.lookY * 6;
      const x = cb.x + (cb.w - dw) / 2 + lookOffX;
      const y = cb.y + (cb.h - dh) / 2 + frame.bobY + lookOffY;
      geometry.current = {
        head: { left: x, right: x + dw, top: y, bottom: y + dh * 0.4 },
        body: { left: x, right: x + dw, top: y, bottom: y + dh },
      };
      if (styleKindRef.current === 'pixel') {
        ctx.imageSmoothingEnabled = false;
      } else {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      ctx.drawImage(img, x, y, dw, dh);
      if (frame.blinkOpacity > 0.01 && backend.manifest.blink) {
        const b = imgs.current.get(
          `${backend.baseUrl}${backend.manifest.blink}`.replace(/([^:]\/)\/+/g, '$1'),
        );
        // resolve blink url same as snapshot
        const blinkUrl = frame.expressionUrl.replace(/[^/]+$/, backend.manifest.blink!);
        const blinkImg = imgs.current.get(blinkUrl) ?? b;
        if (blinkImg) {
          ctx.globalAlpha = frame.blinkOpacity;
          ctx.drawImage(blinkImg, x, y, dw, dh);
          ctx.globalAlpha = 1;
        }
      }
      if (frame.mouthOpacity > 0.02 && frame.mouthUrl) {
        const m = imgs.current.get(frame.mouthUrl);
        if (m) {
          ctx.globalAlpha = frame.mouthOpacity;
          ctx.drawImage(m, x, y, dw, dh);
          ctx.globalAlpha = 1;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    let greeted = false;
    const tryGreet = () => {
      const b = backendRef.current;
      if (!b || !rigRef.current || greeted) return;
      // first open / return-from-hidden: a soft greet nod-wave
      b.playMotion('greet');
      greeted = true;
    };
    // greet shortly after the rig finishes loading
    const greetTimer = window.setTimeout(tryGreet, 900);
    const onVis = () => {
      if (!document.hidden && !raf && !cancelled) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
        // re-arm a greet when returning from a long hide
        if (greeted) greeted = false;
        window.setTimeout(tryGreet, 400);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.clearTimeout(greetTimer);
      document.removeEventListener('visibilitychange', onVis);
      cancelAnimationFrame(raf);
      detach?.();
      backendRef.current?.dispose();
      backendRef.current = null;
      delete document.documentElement.dataset.mascotRig;
    };
  }, [manifestPath]);

  return (
    <div
      className={className}
      data-testid="sprite-canvas"
      data-sprite-style={styleKind}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: transparent ? 'transparent' : '#1e2430',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          imageRendering: styleKind === 'pixel' ? 'pixelated' : 'auto',
        }}
      />
      {ready && (
        <MascotInteractionLayerLite
          canvasRef={canvasRef}
          geometry={geometry}
          registry={mascotRegistry}
        />
      )}
      {!ready && !error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ccc',
            fontSize: 13,
          }}
        >
          Loading 2D sprite…
        </div>
      )}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f88',
            fontSize: 13,
          }}
        >
          Sprite error: {error}
        </div>
      )}
    </div>
  );
};

export default SpriteCanvas;
