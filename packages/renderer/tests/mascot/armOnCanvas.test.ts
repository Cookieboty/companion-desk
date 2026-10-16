import { describe, expect, it } from 'vitest';

import { RigAnimator } from '../../src/mascot/layeredRig';
import { ACTIONS } from '../../src/mascot/rig/actions';
import { ARM_ELBOW_S, ARM_HAND_S, handForeshorten, safeReach, safeReachZ } from '../../src/mascot/rig/armKin';
import { ARM_POSES } from '../../src/mascot/rig/armPoses.generated';
import {
  ELBOW_BOX,
  chainOf,
  handCentre,
  mirror,
  reach,
} from '../../src/mascot/rig/armReach';
import { ARM_TARGETS } from '../../src/mascot/rig/armTargets';
import { HAND_NAMES, IDX } from '../../src/mascot/rig/params';

const DEG = Math.PI / 180;
/** rig canvas is 960 × 1120 */
const CANVAS = { x0: 0, y0: 0, x1: 960, y1: 1120 } as const;
const inside = (x: number, y: number, m = 0) =>
  x >= CANVAS.x0 + m && x <= CANVAS.x1 - m && y >= CANVAS.y0 + m && y <= CANVAS.y1 - m;

const base = {
  expression: 'neutral' as const,
  mouth: 0,
  talking: false,
  blink: 0,
  lookX: 0,
  lookY: 0,
  reducedMotion: false,
};

describe('IK targets are where the hinge arm really puts the hand', () => {
  it('every solved pose lands the hand centre within 3px of its target, elbow and hand on the canvas', () => {
    for (const [name, t] of Object.entries(ARM_TARGETS)) {
      const p = ARM_POSES[name as keyof typeof ARM_POSES];
      for (const side of ['r', 'l'] as const) {
        const want = side === 'r' ? t.t : mirror(t.t);
        const c = handCentre(side, t.hand, p[side]);
        expect(Math.hypot(c.x - want[0], c.y - want[1]), `${name}.${side} hand vs target`).toBeLessThan(3);
        expect(inside(c.x, c.y, 8), `${name}.${side} hand on canvas`).toBe(true);
        // the on-stage guard never alters a solved pose
        expect(safeReachZ(chainOf(side), p[side][0] * DEG, p[side][1] * DEG, p[side][2] * DEG, p[side][3], 0), `${name}.${side} z`).toBeCloseTo(p[side][3], 5);
        const ch = chainOf(side);
        const [a, e, w, z] = p[side];
        ch.set(a * DEG, e * DEG, w * DEG, z, 0);
        const el = [0, 0];
        ch.pos(ARM_ELBOW_S, el);
        expect(el[0], `${name}.${side} elbow x`).toBeGreaterThan(ELBOW_BOX[0] - 1);
        expect(el[0], `${name}.${side} elbow x`).toBeLessThan(ELBOW_BOX[2] + 1);
        expect(el[1], `${name}.${side} elbow y`).toBeGreaterThan(ELBOW_BOX[1] - 1);
        expect(el[1], `${name}.${side} elbow y`).toBeLessThan(ELBOW_BOX[3] + 1);
      }
    }
  });

  it('re-solving reproduces the same hand position (no stale table)', () => {
    const t = ARM_TARGETS.hairTouch;
    const r = reach('r', t.hand, t.t, { angle: t.angle, z: t.z, elbow: t.elbow, hint: t.hint });
    const c = handCentre('r', t.hand, r);
    expect(Math.hypot(c.x - t.t[0], c.y - t.t[1])).toBeLessThan(1.5);
  });
});

describe('every action keeps both hands and elbows on the canvas for the whole timeline', () => {
  const armIdx = {
    r: { on: IDX.rOn, a: IDX.rA, z: IDX.rZ, mix: IDX.rMix, sgn: 1 as const },
    l: { on: IDX.lOn, a: IDX.lA, z: IDX.lZ, mix: IDX.lMix, sgn: -1 as const },
  };
  for (const def of ACTIONS) {
    if (!def.tracks.some((tr) => /^[rl](A|E|On)$/.test(tr.p))) continue;
    it(`${def.id}: hand + elbow stay on the canvas while the arm is posed`, () => {
      const an = new RigAnimator(11);
      const dt = 1 / 60;
      let t = 0;
      for (let i = 0; i < 90; i++) {
        an.step(dt, t, base);
        t += dt;
      }
      const n = Math.round((def.dur + 0.3) / dt);
      const bad: string[] = [];
      const prevShift: Record<string, number> = {};
      for (let f = 0; f <= n; f++) {
        const p = an.step(dt, t, { ...base, gesture: f === 0 ? { name: def.id, id: 1 } : undefined });
        t += dt;
        const v = p.ext?.v;
        if (!v) continue;
        for (const side of ['r', 'l'] as const) {
          const k = armIdx[side];
          if (v[k.on] < 0.5) continue;
          const ch = chainOf(side);
          const rot = side === 'l' ? p.armRotL : p.armRotR;
          const lift = side === 'l' ? p.shoulderL : p.shoulderR;
          const A = v[k.a] * DEG - k.sgn * rot;
          const E = v[k.a + 1] * DEG;
          const W = v[k.a + 2] * DEG;
          const [SA, Z] = safeReach(ch, A, E, W, v[k.z], lift);
          // the guard's shoulder correction must ease in and out, never snap between frames
          const shift = (SA - A) / DEG;
          if (side in prevShift && Math.abs(shift - prevShift[side]) > 14) {
            bad.push(`${side} guard snaps ${prevShift[side].toFixed(0)}→${shift.toFixed(0)}° @${(f * dt).toFixed(2)}s`);
          }
          prevShift[side] = shift;
          ch.set(SA, E, W, Z, lift);
          const el = [0, 0];
          const ha = [0, 0];
          ch.pos(ARM_ELBOW_S, el);
          ch.pos(ARM_HAND_S, ha);
          const tag = `@${(f * dt).toFixed(2)}s`;
          if (!inside(el[0], el[1], 0)) bad.push(`${side} elbow ${el.map(Math.round)} ${tag}`);
          if (!inside(ha[0], ha[1], 0)) bad.push(`${side} wrist ${ha.map(Math.round)} ${tag}`);
          // the hand piece itself (palm centre) must be on the stage once it has faded in
          const hn = HAND_NAMES[v[side === 'r' ? IDX.rHand : IDX.lHand] | 0];
          if (hn && v[k.mix] > 0.3) {
            const c = handCentre(side, hn, [(SA + k.sgn * rot) / DEG, v[k.a + 1], v[k.a + 2], Z]);
            // handCentre is evaluated at lift 0: carry over the shoulder-lift offset of the real attach point
            const fs = handForeshorten(Z, Math.max(0, Math.min(1, v[k.z])));
            const cx = ha[0] + (c.x - c.hx) * fs;
            const cy = ha[1] + (c.y - c.hy) * fs;
            // a hand sweeping through the horizontal may graze the stage edge for a few frames (centre stays on the stage)
            if (!inside(cx, cy, -90)) bad.push(`${side} hand ${Math.round(cx)},${Math.round(cy)} ${tag}`);
          }
        }
      }
      expect(bad.slice(0, 4), `${def.id} off-canvas`).toEqual([]);
    });
  }
});
