import { describe, expect, it, vi } from 'vitest';

import {
  ClickClassifier,
  PatDetector,
  reactionFor,
  REACTIONS,
} from '@/mascot/interaction/gestures';
import { buildColliders, pickRegion, raySphere, regionForBone } from '@/mascot/interaction/regions';
import {
  dampedSpring,
  inertiaGravity,
  lookAngles,
  NECK_LIMITS,
  squashAt,
} from '@/mascot/interaction/springs';

// 1.5m 角色，面向 +Z（相机在 +Z 看过来）
const bones = {
  head: { x: 0, y: 1.35, z: 0 },
  upperChest: { x: 0, y: 1.15, z: 0 },
  spine: { x: 0, y: 0.95, z: 0 },
  hips: { x: 0, y: 0.85, z: 0 },
  leftHand: { x: 0.25, y: 0.75, z: 0.05 },
  rightHand: { x: -0.25, y: 0.75, z: 0.05 },
  leftLowerLeg: { x: 0.08, y: 0.3, z: 0 },
  rightLowerLeg: { x: -0.08, y: 0.3, z: 0 },
};
const cols = buildColliders(bones, { x: 0, y: 0, z: 1 }, 1.5);
const cam = { x: 0, y: 0.82, z: 3.2 };
const towards = (p: { x: number; y: number; z: number }) => {
  const d = { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
};

describe('regions', () => {
  it('maps bones to regions', () => {
    expect(regionForBone('head')).toBe('head');
    expect(regionForBone('leftHand')).toBe('hands');
    expect(regionForBone('hips')).toBe('skirt');
    expect(regionForBone('leftFoot')).toBe('legs');
    expect(regionForBone('tail')).toBeNull();
  });

  it('ray-sphere intersection', () => {
    expect(
      raySphere({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, 1),
    ).toBeCloseTo(4);
    expect(
      raySphere({ x: 0, y: 2, z: 5 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, 1),
    ).toBeNull();
    // 起点在球内：返回出射距离
    expect(
      raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, 1),
    ).toBeCloseTo(1);
  });

  it('picks face in front of the head, top of the head as head', () => {
    expect(pickRegion(cam, towards({ x: 0, y: 1.39, z: 0.06 }), cols)?.region).toBe('face');
    expect(pickRegion(cam, towards({ x: 0, y: 1.55, z: 0 }), cols)?.region).toBe('head');
  });

  it('picks body, hands, skirt, legs and misses empty space', () => {
    expect(pickRegion(cam, towards({ x: 0, y: 1.1, z: 0 }), cols)?.region).toBe('body');
    expect(pickRegion(cam, towards(bones.leftHand), cols)?.region).toBe('hands');
    expect(pickRegion(cam, towards({ x: 0, y: 0.72, z: 0.1 }), cols)?.region).toBe('skirt');
    expect(pickRegion(cam, towards(bones.leftLowerLeg), cols)?.region).toBe('legs');
    expect(pickRegion(cam, towards({ x: 0.8, y: 1.3, z: 0 }), cols)).toBeNull();
  });

  it('scales colliders with character height', () => {
    const small = buildColliders(bones, { x: 0, y: 0, z: 1 }, 0.75);
    expect(small[0].radius).toBeCloseTo(cols[0].radius / 2);
  });
});

describe('gestures', () => {
  it('detects a head pat from back-and-forth motion', () => {
    const p = new PatDetector(10, 1200, 3);
    const xs = [0, 15, 30, 15, 0, 15, 30, 15, 0];
    const hits = xs.map((x, i) => p.feed(x, i * 80));
    expect(hits.some(Boolean)).toBe(true);
  });

  it('ignores slow / tiny wiggles', () => {
    const p = new PatDetector(10, 1200, 3);
    const xs = [0, 3, 0, 3, 0, 3, 0, 3, 0];
    expect(xs.map((x, i) => p.feed(x, i * 80)).some(Boolean)).toBe(false);
    const q = new PatDetector(10, 1200, 3);
    expect([0, 20, 0, 20, 0].map((x, i) => q.feed(x, i * 2000)).some(Boolean)).toBe(false);
  });

  it('classifies single vs double clicks', () => {
    vi.useFakeTimers();
    const got: string[] = [];
    const c = new ClickClassifier((r, k) => got.push(`${k}:${r}`), 260);
    c.click('face');
    vi.advanceTimersByTime(300);
    c.click('head');
    vi.advanceTimersByTime(100);
    c.click('head');
    vi.advanceTimersByTime(300);
    expect(got).toEqual(['click:face', 'double:head']);
    vi.useRealTimers();
  });

  it('every region has a click reaction with a line; skirt protests', () => {
    for (const r of ['head', 'face', 'body', 'hands', 'skirt', 'legs'] as const) {
      const re = reactionFor('click', r);
      expect(re?.lines.length).toBeGreaterThan(0);
    }
    expect(reactionFor('click', 'skirt')?.expression).toBe('angry');
    expect(reactionFor('hover', 'skirt')?.expression).toBe('angry');
    expect(reactionFor('double', 'face')).toBe(REACTIONS.double?.any);
    expect(reactionFor('pat', 'head')?.expression).toBe('happy');
  });
});

describe('springs', () => {
  it('critically damped spring converges without overshoot', () => {
    let s = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 120; i += 1) {
      s = dampedSpring(s, 1, 10, 1, 1 / 60);
      max = Math.max(max, s.x);
    }
    expect(s.x).toBeCloseTo(1, 2);
    expect(max).toBeLessThanOrEqual(1.0001);
  });

  it('spring is stable with a huge dt', () => {
    const s = dampedSpring({ x: 0, v: 0 }, 1, 30, 0.5, 1);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x - 1)).toBeLessThan(0.1);
  });

  it('squash compresses on impact then settles back to 1', () => {
    const a = squashAt(0, 3000);
    expect(a.sy).toBeLessThan(1);
    expect(a.sx).toBeGreaterThan(1);
    expect(squashAt(2, 3000)).toEqual({ sx: 1, sy: 1 });
    expect(1 - squashAt(0, 100000).sy).toBeLessThanOrEqual(0.18);
  });

  it('look angles are clamped to neck limits', () => {
    const far = lookAngles(100000, -100000);
    expect(far.yaw).toBe(NECK_LIMITS.yaw);
    expect(far.pitch).toBe(NECK_LIMITS.pitchUp);
    const down = lookAngles(-100000, 100000);
    expect(down.yaw).toBe(-NECK_LIMITS.yaw);
    expect(down.pitch).toBe(-NECK_LIMITS.pitchDown);
    const z = lookAngles(0, 0);
    expect(Math.abs(z.yaw) + Math.abs(z.pitch)).toBe(0);
  });

  it('window acceleration tilts spring-bone gravity against the motion, clamped', () => {
    const base = { x: 0, y: -1, z: 0 };
    const still = inertiaGravity(base, 1, 0, 0);
    expect(still.power).toBeCloseTo(1);
    const right = inertiaGravity(base, 1, 5000, 0);
    expect(right.dir.x).toBeLessThan(0); // 向右加速 → 头发向左甩
    const crazy = inertiaGravity(base, 1, 1e9, 0);
    expect(crazy.power).toBeLessThanOrEqual(Math.hypot(1, 2.5) + 1e-6);
    const up = inertiaGravity(base, 1, 0, -8000); // 向上加速（屏幕 y 负）→ 更“重”
    expect(up.dir.y).toBeLessThan(0);
    expect(up.power).toBeGreaterThan(1);
  });
});

describe('shape (Linux click-through)', () => {
  it('turns opaque pixels into padded scanline rects in window coords', async () => {
    const { alphaSpans, rectsKey } = await import('@/mascot/interaction/shape');
    const w = 32;
    const h = 16;
    const px = new Uint8Array(w * h * 4);
    // 不透明块：x 8..15，屏幕 y 0..7（GL 行序自下而上 → 行 8..15）
    for (let y = 0; y < 8; y += 1)
      for (let x = 8; x < 16; x += 1) px[((h - 1 - y) * w + x) * 4 + 3] = 255;
    const rects = alphaSpans(px, w, h, { band: 8, pad: 2, scale: 0.5, offsetX: 100, offsetY: 10 });
    expect(rects).toEqual([{ x: 100 + 4 - 2, y: 10 - 2, width: 4 + 4, height: 4 + 4 }]);
    expect(rectsKey(rects)).toBe('102,8,8,8');
    expect(alphaSpans(new Uint8Array(w * h * 4), w, h)).toEqual([]);
  });

  it('bridges small gaps but splits far-apart islands', async () => {
    const { alphaSpans } = await import('@/mascot/interaction/shape');
    const w = 64;
    const h = 8;
    const px = new Uint8Array(w * h * 4);
    for (const x of [2, 3, 6, 7, 40, 41])
      for (let y = 0; y < h; y += 1) px[(y * w + x) * 4 + 3] = 200;
    const rects = alphaSpans(px, w, h, { band: 8, pad: 0, gap: 4 });
    expect(rects.map((r) => [r.x, r.width])).toEqual([
      [2, 6],
      [40, 2],
    ]);
  });
});
