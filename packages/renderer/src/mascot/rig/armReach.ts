/**
 * Hand-target (IK) solver for the Nomi arms, shared by the action library and the tests.
 *
 * `reach('r', 'rest', LM.cheekR, { angle: 20 })` returns the arm pose [a, e, w, z] (degrees / 0..1) whose
 * hand piece is drawn with its palm centre on the landmark and its fingers pointing `angle` degrees
 * clockwise from straight up. It solves against the exact same ArmChain the mesh renderer draws, so a
 * target is where the hand really lands (see tests/mascot/armReach.test.ts).
 *
 * Sides: the rig's `r` arm is the one on the SCREEN RIGHT, i.e. the character's own LEFT arm
 * (sgn +1, hands drawn as their native chirality); `l` is on the screen left = the character's RIGHT arm.
 */

import { ARM_HAND_S, ARM_WRIST_MERGE, ArmChain, type ArmGeom, HAND_BASE } from './armKin';

const DEG = Math.PI / 180;

/** geometry of the two master sleeve layers (== manifest.json rig.arms / rig.pivots / rig.layers) */
export const ARM_GEOM: Record<'r' | 'l', ArmGeom> = {
  r: {
    layer: 'arm-r',
    sgn: 1,
    theta: 0.17853,
    s0: [66.75, 0],
    smin: -8.7,
    smax: 694.1,
    nmin: -72.2,
    nmax: 85.9,
  },
  l: {
    layer: 'arm-l',
    sgn: -1,
    theta: 0.17821,
    s0: [189.61, 0],
    smin: -8.6,
    smax: 694.2,
    nmin: -79.9,
    nmax: 102.2,
  },
};
export const ARM_PIVOT: Record<'r' | 'l', [number, number]> = { r: [652, 474], l: [300, 470] };
export const ARM_OFF: Record<'r' | 'l', [number, number]> = { r: [621, 439], l: [68, 439] };

/** which of the character's hands a hand piece depicts (as drawn), S = symmetric */
export type HandSide = 'L' | 'R' | 'S';

export interface HandFit {
  /** native chirality of the artwork: the character's left / right hand, or symmetric */
  side: HandSide;
  /** palm-normalising multiplier on HAND_BASE */
  k: number;
  /** centre of the hand (above the cuff line) in piece px */
  cx: number;
  cy: number;
  /** attach point / cuff line in piece px (== manifest rig.hands) */
  ax: number;
  ay: number;
  cuffY: number;
}

/** per hand shape; asserted equal to manifest.json rig.hands by tests/mascot/partsManifest.test.ts */
export const HAND_FIT: Record<string, HandFit> = {
  wave: { side: 'L', k: 1, cx: 153, cy: 184, ax: 155, ay: 675, cuffY: 445 },
  fist: { side: 'R', k: 0.92, cx: 123, cy: 79, ax: 113.5, ay: 487, cuffY: 257 },
  thumbsup: { side: 'R', k: 1, cx: 121, cy: 89, ax: 99.5, ay: 480, cuffY: 250 },
  point: { side: 'R', k: 1, cx: 91, cy: 164, ax: 91.5, ay: 583, cuffY: 353 },
  rest: { side: 'R', k: 0.95, cx: 142, cy: 122, ax: 101, ay: 574, cuffY: 344 },
  peace: { side: 'L', k: 1, cx: 114, cy: 134, ax: 87, ay: 558, cuffY: 328 },
  prayer: { side: 'S', k: 1.15, cx: 101, cy: 114, ax: 100.5, ay: 539, cuffY: 297.9 },
  ok: { side: 'L', k: 0.92, cx: 167, cy: 217, ax: 139.5, ay: 702, cuffY: 460 },
  chest: { side: 'R', k: 0.95, cx: 135, cy: 178, ax: 123.5, ay: 655, cuffY: 413.1 },
};

/** the character's hand that arm `side` is (r = screen right = the character's left) */
export const armHand = (side: 'r' | 'l'): 'L' | 'R' => (side === 'r' ? 'L' : 'R');
/** does this hand shape have to be mirrored on this arm to be that arm's own hand? */
export const handFlips = (hand: string, side: 'r' | 'l'): boolean => {
  const f = HAND_FIT[hand];
  return !!f && f.side !== 'S' && f.side !== armHand(side);
};

/** landmarks on the drawn character (rig px) */
export const LM = {
  chin: [474, 388],
  chinL: [452, 384],
  chinR: [498, 384],
  mouth: [475, 336],
  cheekL: [405, 318],
  cheekR: [545, 318],
  jawL: [396, 352],
  jawR: [552, 352],
  templeL: [372, 262],
  templeR: [578, 262],
  hairL: [335, 300],
  hairR: [618, 300],
  forehead: [474, 180],
  headTop: [474, 100],
  earR: [588, 290],
  earL: [362, 290],
  neck: [474, 420],
  collarL: [420, 470],
  collarR: [530, 470],
  chest: [474, 560],
  heartL: [430, 570],
  heartR: [518, 570],
  belly: [474, 700],
  sideOutL: [150, 640],
  sideOutR: [800, 640],
} as const satisfies Record<string, readonly [number, number]>;

export const MIRROR_X = 476;

const chains: Partial<Record<'r' | 'l', ArmChain>> = {};
export const chainOf = (side: 'r' | 'l'): ArmChain =>
  (chains[side] ??= new ArmChain(ARM_GEOM[side], ARM_PIVOT[side], ARM_OFF[side]));

/** screen position of the hand centre for a pose (deg), via the same ArmChain the renderer uses */
export function handCentre(
  side: 'r' | 'l',
  hand: string,
  pose: readonly [number, number, number, number],
): { x: number; y: number; psi: number; hx: number; hy: number } {
  const ch = chainOf(side);
  ch.set(pose[0] * DEG, pose[1] * DEG, pose[2] * DEG, pose[3], 0, ARM_WRIST_MERGE);
  const t = [0, 0];
  ch.pos(ARM_HAND_S, t);
  const psi = ch.phiOf(ARM_HAND_S) - ch.sgn * ch.theta + Math.PI + ch.sgnRot * ch.wRest;
  const f = HAND_FIT[hand];
  const hs = HAND_BASE * f.k;
  const cuffLift = Math.max(0, (f.ay - f.cuffY) * 0.2);
  const flip = handFlips(hand, side) ? -1 : 1;
  const up = (f.ay - f.cy - cuffLift) * hs;
  const lat = (f.cx - f.ax) * hs * flip;
  const s = Math.sin(psi);
  const c = Math.cos(psi);
  // piece "up" = (sinψ, −cosψ), piece "right" = (cosψ, sinψ)
  return {
    x: t[0] + s * up + c * lat,
    y: t[1] - c * up + s * lat,
    psi,
    hx: t[0],
    hy: t[1],
  };
}

export type ReachPose = [a: number, e: number, w: number, z: number];

export interface ReachOpts {
  /** fingers point this many degrees clockwise from straight up (0 up, 90 right, −90 left) */
  angle?: number;
  /** reach toward the camera 0..1 */
  z?: number;
  /** preferred elbow flexion sign: +1 forearm turns outward / up, −1 folds across the body (default: best) */
  elbow?: 1 | -1;
  /** natural joint hint [a, e] (deg): among poses that reach the target the closest to it wins */
  hint?: readonly [number, number];
  /** a pose to stay close to (the mirrored arm of a bilateral action): wins over `hint` */
  near?: readonly [number, number];
}

const W_MAX = 45 * DEG;
const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

function reachExact(
  side: 'r' | 'l',
  hand: string,
  target: readonly [number, number],
  o: ReachOpts = {},
): { pose: ReachPose; cost: number } | null {
  const ch = chainOf(side);
  const z = o.z ?? 0;
  const angle = (o.angle ?? 0) * DEG;
  const sgnRot = ch.sgnRot;
  const f = HAND_FIT[hand];
  if (!f) throw new Error(`reach: unknown hand ${hand}`);
  const hs = HAND_BASE * f.k;
  const cuffLift = Math.max(0, (f.ay - f.cuffY) * 0.2);
  const flip = handFlips(hand, side) ? -1 : 1;
  const up = (f.ay - f.cy - cuffLift) * hs;
  const lat = (f.cx - f.ax) * hs * flip;
  const t = [0, 0];
  const wFor = (a: number, e: number) => {
    // hand angle ψ = φ0(hand) − sgn·θ + π + sgnRot·w  (independent of the fold split)
    ch.set(a, e, 0, z, 0, ARM_WRIST_MERGE);
    const phi0 = ch.phi0(ARM_HAND_S);
    const w = wrapPi((angle - phi0 + ch.sgn * ch.theta - Math.PI) / sgnRot);
    return Math.max(-W_MAX, Math.min(W_MAX, w));
  };
  /** hand-centre error of the REAL chain (a clamped wrist changes the fingers angle, so it counts) */
  const err = (a: number, e: number, w: number) => {
    ch.set(a, e, w, z, 0, ARM_WRIST_MERGE);
    ch.pos(ARM_HAND_S, t);
    const psi = ch.phiOf(ARM_HAND_S) - ch.sgn * ch.theta + Math.PI + ch.sgnRot * ch.wRest;
    const s = Math.sin(psi);
    const c = Math.cos(psi);
    return [t[0] + s * up + c * lat - target[0], t[1] - c * up + s * lat - target[1]] as const;
  };
  const ref = o.near ?? o.hint ?? [15, 0];
  const costOf = (a: number, e: number, w: number) =>
    (Math.abs(a / DEG - ref[0]) * (o.near ? 3 : 1) +
      Math.abs(e / DEG - ref[1]) * (o.near ? 2 : 0.5) +
      Math.abs(w / DEG) * 0.9) *
    1;
  // coarse grid → local minima of the hand-centre error → Newton polish of each
  const AN = 31;
  const EN = 45;
  const grid = new Float64Array(AN * EN);
  const aOf = (i: number) => (-100 + i * 8) * DEG;
  const eOf = (j: number) => (-110 + j * 5) * DEG;
  for (let i = 0; i < AN; i++)
    for (let j = 0; j < EN; j++) {
      const fe = err(aOf(i), eOf(j), wFor(aOf(i), eOf(j)));
      grid[i * EN + j] = Math.hypot(fe[0], fe[1]);
    }
  const cand: { a: number; e: number; d: number }[] = [];
  for (let i = 0; i < AN; i++)
    for (let j = 0; j < EN; j++) {
      const d = grid[i * EN + j];
      if (d > 60) continue;
      if (o.elbow && Math.sign(eOf(j)) !== o.elbow) continue;
      let isMin = true;
      for (let di = -1; di <= 1 && isMin; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const ii = i + di;
          const jj = j + dj;
          if ((di || dj) && ii >= 0 && ii < AN && jj >= 0 && jj < EN && grid[ii * EN + jj] < d) {
            isMin = false;
            break;
          }
        }
      if (isMin) cand.push({ a: aOf(i), e: eOf(j), d });
    }
  cand.sort((p, q) => p.d - q.d);
  let best: { a: number; e: number; w: number; err: number; cost: number } | null = null;
  for (const { a: a0, e: e0 } of cand.slice(0, 16)) {
    let a = a0;
    let e = e0;
    let w = wFor(a, e);
    let fe = err(a, e, w);
    for (let it = 0; it < 40; it++) {
      const d = 1e-3;
      const fa = err(a + d, e, wFor(a + d, e));
      const fE = err(a, e + d, wFor(a, e + d));
      const j00 = (fa[0] - fe[0]) / d;
      const j10 = (fa[1] - fe[1]) / d;
      const j01 = (fE[0] - fe[0]) / d;
      const j11 = (fE[1] - fe[1]) / d;
      const det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-9) break;
      let da = -(j11 * fe[0] - j01 * fe[1]) / det;
      let de = -(-j10 * fe[0] + j00 * fe[1]) / det;
      const m = Math.max(Math.abs(da), Math.abs(de));
      if (m > 0.2) {
        da *= 0.2 / m;
        de *= 0.2 / m;
      }
      a = Math.max(-1.9, Math.min(2.6, a + da));
      e = Math.max(-1.92, Math.min(1.92, e + de));
      w = wFor(a, e);
      fe = err(a, e, w);
      if (Math.hypot(fe[0], fe[1]) < 0.1) break;
    }
    const er = Math.hypot(fe[0], fe[1]);
    const cost = costOf(a, e, w);
    if (er < 1.5 && (!o.elbow || Math.sign(e) === o.elbow)) {
      if (!best || cost < best.cost) best = { a, e, w, err: er, cost };
    }
  }
  return best
    ? { pose: [best.a / DEG, best.e / DEG, best.w / DEG, z] as ReachPose, cost: best.cost / 1 }
    : null;
}

/**
 * Solve [a, e, w, z] (deg) for the hand centre `target`. The fingers angle is a preference: poses
 * within ±120° of it compete on naturalness (closeness to the joint hint) minus an angle penalty, so a
 * target never silently misses. Throws when the position itself is out of reach.
 */
export function reach(
  side: 'r' | 'l',
  hand: string,
  target: readonly [number, number],
  o: ReachOpts = {},
): ReachPose {
  const base = o.angle ?? 0;
  let best: { pose: ReachPose; score: number } | null = null;
  for (let k = 0; k <= 12; k++) {
    for (const sg of k === 0 ? [1] : [1, -1]) {
      const d = sg * k * 10;
      const r = reachExact(side, hand, target, { ...o, angle: base + d });
      if (!r) continue;
      const score = r.cost + Math.abs(d) * 0.3;
      if (!best || score < best.score) best = { pose: r.pose, score };
    }
  }
  if (!best) throw new Error(`reach(${side},${hand}) unreachable: target ${target} angle ${base}`);
  return best.pose;
}

/** mirror a landmark about the body centre line (for the opposite arm in bilateral actions) */
export const mirror = (p: readonly [number, number]): [number, number] => [
  2 * MIRROR_X - p[0],
  p[1],
];
