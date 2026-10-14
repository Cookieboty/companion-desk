import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';

import type { MotionClipData, MotionLibrary } from './library';

/** Base-loop crossfade (idle ↔ talk / walk) — longer = softer. */
const BASE_FADE = 0.55;

/**
 * One-shot fade length. Prefer longer blends so gestures ease in/out instead of snapping.
 * Short clips still get at least ~0.22s so they aren't all crossfade.
 */
export function fadeFor(duration: number): number {
  return Math.max(0.22, Math.min(0.55, duration * 0.3));
}

/** How far gesture keyframes lean toward idle/rest (0 = raw, 1 = fully rest). */
export function poseSoften(name: string, tags: string[]): number {
  if (name === 'idle' || name === 'talk') return 0.06;
  if (name === 'walk' || tags.includes('locomotion')) return 0.1;
  if (tags.includes('idle')) return 0.14;
  return 0.2;
}

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
 * - 片段缺失的骨骼用 idle 第 0 帧补齐；姿态向 idle 软化，减少夸张起手
 */
export class MotionController {
  readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly meta = new Map<string, MotionClipData>();
  private base: THREE.AnimationAction | null = null;
  private baseName = 'idle';
  private current: THREE.AnimationAction | null = null;
  private currentName: string | null = null;
  private gestureStartedAt = 0;
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
    this.every = opts.idleVarietyEvery ?? [18, 36];
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
    next.setEffectiveTimeScale(name === 'talk' ? 0.92 : 0.88);
    if (this.current) {
      next.play().setEffectiveWeight(0);
    } else {
      next.fadeIn(BASE_FADE).play();
    }
    if (this.base && this.base !== next) this.base.fadeOut(BASE_FADE);
    this.base = next;
    this.baseName = name;
  }

  /** 播放动作；'random' = 随机一个手势。返回是否找到该动作。 */
  play(name: string): boolean {
    const alias: Record<string, string> = { jump: 'cheer' };
    const resolved = name === 'random' ? this.randomGesture() : (alias[name] ?? name);
    if (!resolved) return false;
    const clip = this.clips.get(resolved);
    if (!clip) return false;
    const data = this.meta.get(resolved);
    if (resolved === 'idle' || resolved === 'talk' || data?.tags.includes('locomotion')) {
      this.setBase(resolved);
      return true;
    }
    const fade = fadeFor(data?.duration ?? clip.duration);
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(data?.loop ? THREE.LoopRepeat : THREE.LoopOnce, data?.loop ? 2 : 1);
    action.clampWhenFinished = true;
    // Start slow so the first frames aren't snappy; update() ramps timeScale up.
    action.setEffectiveTimeScale(0.55);
    action.setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current && this.current !== action) this.current.fadeOut(fade);
    // Keep a whisper of the base loop under the gesture for continuity
    if (this.base) {
      this.base.fadeOut(fade * 0.85);
    }
    this.current = action;
    this.currentName = resolved;
    this.gestureStartedAt = this.elapsed;
    this.emit();
    return true;
  }

  stop(): void {
    if (!this.current) return;
    const fade = Math.max(fadeFor(this.meta.get(this.currentName ?? '')?.duration ?? 1), BASE_FADE);
    this.current.fadeOut(fade);
    this.current = null;
    this.currentName = null;
    if (this.base) {
      if (!this.base.isRunning()) this.base.play();
      this.base.setEffectiveTimeScale(this.baseName === 'talk' ? 0.92 : 0.88);
      this.base.setEffectiveWeight(1).fadeIn(BASE_FADE);
    }
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
    // Ease gesture playback up to ~0.9× over 0.35s (less snappy starts)
    if (this.current) {
      const u = Math.min(1, (this.elapsed - this.gestureStartedAt) / 0.35);
      const ease = u * u * (3 - 2 * u); // smoothstep
      this.current.setEffectiveTimeScale(0.55 + 0.35 * ease);
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

const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();

/** Soften a flat quat keyframe array toward a rest quat (first 4 of rest, or identity). */
export function softenQuats(values: number[], rest4: number[], amount: number): number[] {
  if (amount <= 0 || values.length < 4) return values;
  const out = values.slice();
  _r.set(rest4[0] ?? 0, rest4[1] ?? 0, rest4[2] ?? 0, rest4[3] ?? 1).normalize();
  for (let i = 0; i < out.length; i += 4) {
    _q.set(out[i], out[i + 1], out[i + 2], out[i + 3]).normalize();
    _q.slerp(_r, amount);
    out[i] = _q.x;
    out[i + 1] = _q.y;
    out[i + 2] = _q.z;
    out[i + 3] = _q.w;
  }
  return out;
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
  const soften = poseSoften(data.name, data.tags);

  for (const bone of names) {
    const node = vrm.humanoid?.getNormalizedBoneNode(bone as VRMHumanBoneName);
    if (!node) continue;
    const own = data.tracks[bone];
    if (own) {
      let vals = own.map(sign);
      const restSrc = fill?.tracks[bone]?.slice(0, 4).map(sign) ?? vals.slice(0, 4);
      vals = softenQuats(vals, restSrc, soften);
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, data.times, vals));
    } else if (fill) {
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
    const bob =
      data.name === 'idle' || data.name === 'talk'
        ? 0.28
        : data.name === 'walk'
          ? 0.55
          : data.tags.includes('idle')
            ? 0.4
            : 0.55;
    for (let i = 0; i < data.times.length; i += 1) {
      values.push(rest.x, rest.y + data.hips[i * 3 + 1] * height * bob, rest.z);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, data.times, values));
  }
  return new THREE.AnimationClip(data.name, data.duration, tracks);
}
