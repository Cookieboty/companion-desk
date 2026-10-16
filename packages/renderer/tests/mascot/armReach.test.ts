import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../../src/mascot/rig/actions';
import { ARM_POSES, type ArmPose } from '../../src/mascot/rig/armPoses.generated';
import {
  HAND_FIT,
  MIRROR_X,
  armHand,
  handCentre,
  handFlips,
  reach,
} from '../../src/mascot/rig/armReach';
import { ARM_TARGETS } from '../../src/mascot/rig/armTargets';
import { drawHandPiece } from '../../src/mascot/rig/meshArm';
import { HAND, HAND_NAMES } from '../../src/mascot/rig/params';

const MODEL = path.join(__dirname, '../../public/assets/models/sprite/nomi');
const manifest = JSON.parse(fs.readFileSync(path.join(MODEL, 'manifest.json'), 'utf8')).rig as {
  hands: Record<string, Record<string, number | string>>;
};
const parts = JSON.parse(fs.readFileSync(path.join(MODEL, 'parts.json'), 'utf8')) as {
  hands: Array<{ id: string; side: string; scale: number; centre: [number, number] }>;
  arms: Record<string, { character: string; pieces: Record<string, unknown> }>;
};

const names = Object.keys(ARM_TARGETS);
const mirrorT = (t: readonly [number, number]): [number, number] => [2 * MIRROR_X - t[0], t[1]];

describe('IK arm poses (armTargets → armPoses.generated)', () => {
  it('has a generated pose for every target and nothing else', () => {
    expect(Object.keys(ARM_POSES).sort()).toEqual(names.sort());
  });

  it('is fresh: re-solving the targets gives the committed table', () => {
    for (const n of names) {
      const t = ARM_TARGETS[n];
      const r = reach('r', t.hand, t.t, {
        angle: t.angle,
        z: t.z,
        elbow: t.elbow,
        hint: t.hint,
      });
      const got = ARM_POSES[n as keyof typeof ARM_POSES].r;
      r.slice(0, 4).forEach((v, i) => expect(v, `${n}[${i}]`).toBeCloseTo(got[i], 0));
    }
  });

  it('lands the hand centre on its target within 2 px (both arms, mirrored targets)', () => {
    for (const n of names) {
      const t = ARM_TARGETS[n];
      const p = ARM_POSES[n as keyof typeof ARM_POSES];
      const cr = handCentre('r', t.hand, p.r as ArmPose);
      expect(Math.hypot(cr.x - t.t[0], cr.y - t.t[1]), `${n}.r`).toBeLessThan(2);
      const tl = mirrorT(t.t);
      const cl = handCentre('l', t.hand, p.l as ArmPose);
      expect(Math.hypot(cl.x - tl[0], cl.y - tl[1]), `${n}.l`).toBeLessThan(2);
    }
  });

  it('left and right arms are mirrored counterparts (same sense of every joint) in every bilateral pose', () => {
    const bilateral = [
      'waveOut',
      'waveUp',
      'waveHigh',

      'surprise',
      'cheek',
      'cheekPaw',
      'coverFace',
      'sorry',
      'type',
      'clap',
      'pray',
      'shrug',
      'stretchUp',
    ];
    for (const n of bilateral) {
      const p = ARM_POSES[n as keyof typeof ARM_POSES];
      expect(Math.abs(p.r[0] - p.l[0]), `${n}.a`).toBeLessThan(6);
      expect(Math.abs(p.r[1] - p.l[1]), `${n}.e`).toBeLessThan(16);
      expect(Math.abs(p.r[2] - p.l[2]), `${n}.w`).toBeLessThan(25);
      expect(p.r[3]).toBe(p.l[3]);
    }
  });

  it('stays inside the joint limits', () => {
    for (const n of names) {
      const p = ARM_POSES[n as keyof typeof ARM_POSES];
      for (const s of ['r', 'l'] as const) {
        expect(Math.abs(p[s][1]), `${n}.${s}.e`).toBeLessThanOrEqual(126.1);
        expect(Math.abs(p[s][2]), `${n}.${s}.w`).toBeLessThanOrEqual(45.01);
        expect(p[s][3]).toBeGreaterThanOrEqual(0);
        expect(p[s][3]).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('hand chirality (character left / right)', () => {
  it('the screen-right arm (r) is the character LEFT arm, the screen-left arm (l) the RIGHT arm', () => {
    expect(armHand('r')).toBe('L');
    expect(armHand('l')).toBe('R');
    expect(parts.arms.r.character).toBe('left');
    expect(parts.arms.l.character).toBe('right');
  });

  it('every hand piece is flipped iff it depicts the other hand than the arm it is on', () => {
    for (const [name, fit] of Object.entries(HAND_FIT)) {
      for (const side of ['r', 'l'] as const) {
        const flips = handFlips(name, side);
        if (fit.side === 'S') expect(flips, `${name}.${side}`).toBe(false);
        else expect(flips, `${name}.${side}`).toBe(fit.side !== armHand(side));
      }
      // a mirrored pair of arms always shows one native and one mirrored hand (except symmetric art)
      if (fit.side !== 'S') expect(handFlips(name, 'r')).not.toBe(handFlips(name, 'l'));
    }
  });

  it('the effective hand (native side after the flip) is the arm’s own hand', () => {
    for (const [name, fit] of Object.entries(HAND_FIT)) {
      if (fit.side === 'S') continue;
      for (const side of ['r', 'l'] as const) {
        const effective = handFlips(name, side) ? (fit.side === 'L' ? 'R' : 'L') : fit.side;
        expect(effective, `${name}.${side}`).toBe(armHand(side));
      }
    }
  });

  it('the drawn pixels are mirrored exactly when the rule says so (x scale sign on the canvas)', () => {
    const rec = (flip: 1 | -1) => {
      const sx: number[] = [];
      const ctx = {
        globalAlpha: 1,
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        scale(x: number) {
          sx.push(x);
        },
        drawImage() {},
      } as unknown as CanvasRenderingContext2D;
      const m = manifest.hands.wave as Record<string, number>;
      drawHandPiece(
        ctx,
        {} as CanvasImageSource,
        { w: m.w, h: m.h, ax: m.ax, ay: m.ay, cuffY: m.cuffY, sleeveW: m.sleeveW } as never,
        flip,
        1,
        0.4,
      );
      return sx;
    };
    expect(rec(1).every((x) => x > 0)).toBe(true);
    expect(rec(-1).every((x) => x < 0)).toBe(true);
  });

  it('the hand fit table equals manifest.json rig.hands and parts.json hands', () => {
    for (const [name, fit] of Object.entries(HAND_FIT)) {
      const h = manifest.hands[name];
      for (const [k, v] of Object.entries(fit)) expect(h[k], `${name}.${k}`).toBe(v);
      const ph = parts.hands.find((x) => x.id === `hand-${name}`)!;
      expect(ph.side).toBe(fit.side);
      expect(ph.scale).toBe(fit.k);
      expect(ph.centre).toEqual([fit.cx, fit.cy]);
    }
    expect(Object.keys(HAND_FIT).sort()).toEqual(HAND_NAMES.filter(Boolean).slice().sort());
  });

  it('bilateral actions drive both arms with the same hand shape and mirrored poses', () => {
    for (const id of ['pray', 'wave_both', 'clap', 'celebrate', 'cute', 'shy', 'happy_bounce']) {
      const a = ACTIONS.find((x) => x.id === id)!;
      const val = (p: string) => a.tracks.find((t) => t.p === p);
      const hr = val('rHand');
      const hl = val('lHand');
      expect(hr, id).toBeTruthy();
      expect(hl, id).toBeTruthy();
      expect(hr!.k[0][1], id).toBe(hl!.k[0][1]);
      const ar = val('rA')!.k.map((k) => k[1]);
      const al = val('lA')!.k.map((k) => k[1]);
      ar.forEach((v, i) => expect(Math.abs(v - al[i]), `${id}.a[${i}]`).toBeLessThan(6));
    }
    expect(HAND.prayer).toBe(7);
  });
});
