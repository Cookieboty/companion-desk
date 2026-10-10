import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';

import type { MotionClipData, MotionLibrary } from './library';

const FADE = 0.35;

export interface MotionControllerOptions {
  /** 随机待机小动作的间隔（秒）[min, max] */
  idleVarietyEvery?: [number, number];
  random?: () => number;
  /** 动作白名单（缺省 = 全部；idle / talk 总是保留） */
  allow?: string[];
}

/**
 * 动画管理器：AnimationMixer + 交叉淡入淡出。
 * - 基础循环：idle（说话时切 talk）
 * - 随机待机变化：每隔一段时间播放 tags 含 'idle' 的小动作
 * - 一次性动作播完自动淡回基础循环
 * - 片段缺失的骨骼用 idle 第 0 帧补齐，保证切换时全身连续
 */
export class MotionController {
  readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly meta = new Map<string, MotionClipData>();
  private base: THREE.AnimationAction | null = null;
  private baseName = 'idle';
  private current: THREE.AnimationAction | null = null;
  private currentName: string | null = null;
  private nextIdleVariety: number;
  private elapsed = 0;
  private readonly every: [number, number];
  private readonly rnd: () => number;
  private readonly listeners = new Set<(name: string | null) => void>();

  constructor(
    private readonly vrm: VRM,
    lib: MotionLibrary,
    opts: MotionControllerOptions = {},
  ) {
    this.every = opts.idleVarietyEvery ?? [14, 28];
    this.rnd = opts.random ?? Math.random;
    this.nextIdleVariety = this.pickIdleDelay();
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    const idle = lib.clips.find((c) => c.name === 'idle');
    const allow = opts.allow?.length ? new Set([...opts.allow, 'idle', 'talk']) : null;
    for (const c of lib.clips) {
      if (allow && !allow.has(c.name)) continue;
      this.meta.set(c.name, c);
      this.clips.set(c.name, buildClip(vrm, c, idle));
    }
    this.mixer.addEventListener('finished', (e) => {
      if ((e as unknown as { action: THREE.AnimationAction }).action === this.current) this.stop();
    });
    if (this.clips.has('idle')) this.setBase('idle');
  }

  names(): string[] {
    return [...this.clips.keys()];
  }

  playing(): string | null {
    return this.currentName;
  }

  onChange(fn: (name: string | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 切换基础循环（idle / talk） */
  setBase(name: string): void {
    const clip = this.clips.get(name);
    if (!clip || (this.baseName === name && this.base)) return;
    const next = this.mixer.clipAction(clip);
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1);
    if (this.current) {
      // 一次性动作进行中：基础层先静默，等动作结束再淡入
      next.play().setEffectiveWeight(0);
    } else {
      next.fadeIn(FADE).play();
    }
    if (this.base && this.base !== next) this.base.fadeOut(FADE);
    this.base = next;
    this.baseName = name;
  }

  /** 播放动作；'random' = 随机一个手势。返回是否找到该动作。 */
  play(name: string): boolean {
    const resolved = name === 'random' ? this.randomGesture() : name;
    if (!resolved) return false;
    const clip = this.clips.get(resolved);
    if (!clip) return false;
    const data = this.meta.get(resolved);
    if (resolved === 'idle' || resolved === 'talk' || data?.tags.includes('locomotion')) {
      this.setBase(resolved);
      return true;
    }
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(data?.loop ? THREE.LoopRepeat : THREE.LoopOnce, data?.loop ? 2 : 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1).fadeIn(FADE).play();
    if (this.current && this.current !== action) this.current.fadeOut(FADE);
    this.base?.fadeOut(FADE);
    this.current = action;
    this.currentName = resolved;
    this.emit();
    return true;
  }

  stop(): void {
    if (!this.current) return;
    this.current.fadeOut(FADE);
    this.current = null;
    this.currentName = null;
    if (this.base) this.base.reset().setEffectiveWeight(1).fadeIn(FADE).play();
    this.nextIdleVariety = this.elapsed + this.pickIdleDelay();
    this.emit();
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (!this.current && this.baseName === 'idle' && this.elapsed >= this.nextIdleVariety) {
      const pool = [...this.meta.values()].filter(
        (c) => c.tags.includes('idle') && c.name !== 'idle',
      );
      if (pool.length) this.play(pool[Math.floor(this.rnd() * pool.length)].name);
      this.nextIdleVariety = this.elapsed + this.pickIdleDelay();
    }
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.vrm.scene);
    this.listeners.clear();
  }

  private randomGesture(): string | null {
    const pool = ['wave', 'nod', 'clap', 'cheer', 'think', 'bow'].filter((n) => this.clips.has(n));
    return pool.length ? pool[Math.floor(this.rnd() * pool.length)] : null;
  }

  private pickIdleDelay(): number {
    const [a, b] = this.every;
    return a + this.rnd() * (b - a);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.currentName);
  }
}

/** 规范化骨骼动作数据 → 针对某个 VRM 的 AnimationClip */
export function buildClip(
  vrm: VRM,
  data: MotionClipData,
  fill?: MotionClipData,
): THREE.AnimationClip {
  const isVrm0 = (vrm.meta as { metaVersion?: string } | undefined)?.metaVersion === '0';
  const sign = (v: number, i: number) => (isVrm0 && i % 2 === 0 ? -v : v);
  const tracks: THREE.KeyframeTrack[] = [];
  const names = new Set(Object.keys(data.tracks));
  if (fill && fill !== data) for (const b of Object.keys(fill.tracks)) names.add(b);

  for (const bone of names) {
    const node = vrm.humanoid?.getNormalizedBoneNode(bone as VRMHumanBoneName);
    if (!node) continue;
    const own = data.tracks[bone];
    if (own) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, data.times, own.map(sign)),
      );
    } else if (fill) {
      // 该片段不动的骨骼：固定为 idle 第 0 帧
      const q = fill.tracks[bone].slice(0, 4).map(sign);
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${node.name}.quaternion`,
          [0, data.duration],
          [...q, ...q],
        ),
      );
    }
  }

  const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
  if (hips && data.hips.length === data.times.length * 3) {
    const rest = hips.position.clone();
    const height = Math.max(
      0.3,
      vrm.humanoid?.normalizedRestPose?.hips?.position?.[1] ?? rest.y ?? 0.9,
    );
    const values: number[] = [];
    for (let i = 0; i < data.times.length; i += 1) {
      // 原地动作：只保留竖直位移（跳跃 / 下蹲），水平位移归零以免漂移
      values.push(rest.x, rest.y + data.hips[i * 3 + 1] * height, rest.z);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, data.times, values));
  }
  return new THREE.AnimationClip(data.name, data.duration, tracks);
}
