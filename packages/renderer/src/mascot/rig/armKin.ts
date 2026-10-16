/**
 * Arm kinematics for the Nomi 2D rig (pure math, no canvas): one sleeve spine that is bent at the
 * shoulder and at the elbow, with a hand frame at its end.
 *
 * Both the mesh renderer (meshArm.ts) and the IK solver used by the action library
 * (armReach.ts) evaluate THIS chain, so a hand target solved at load time is exactly where the
 * hand piece is drawn. Everything here is continuous in (a, e, w, z): no thresholds, no velocity
 * terms, nothing that can pop between two frames.
 *
 * Conventions (rig px, y down). The arm hangs along the rest axis u0 = (sgn·sinθ, cosθ).
 *   a  shoulder swing (rad)  + = outward / up, away from the body
 *   e  elbow flexion (rad)   + = forearm keeps turning outward / up, − = turns back across the body
 *   w  wrist (rad)           same sense as e, applied to the hand piece (the first ARM_WRIST_MERGE of
 *                            it is folded into the sleeve end so cloth and cuff stay one surface)
 *   z  reach toward the camera 0..1: foreshortens the upper arm and (more) the forearm
 */

export interface ArmGeom {
  layer: string;
  /** +1 right arm (outward = +x), −1 left arm */
  sgn: 1 | -1;
  /** spine tilt from vertical (rad, magnitude) */
  theta: number;
  /** spine origin in layer-local px */
  s0: [number, number];
  smin: number;
  smax: number;
  nmin: number;
  nmax: number;
}

/** spine arc-length (sleeve px) of the elbow, the bend length at 0 flexion, and the hand attach */
export const ARM_ELBOW_S = 340;
export const ARM_BEND_LEN = 28;
export const ARM_HAND_S = 560;
/** s where the sleeve taper starts / has finished (merged wrist mode) */
export const ARM_TAPER_S0 = 380;
export const ARM_TAPER_S1 = ARM_HAND_S - 30;
/** elbow flexion limit (rad) */
export const ARM_BEND_MAX = 2.2; // ~126° — rigid hinge + elbow cap; deeper folds are foreshortened instead
export const ARM_WRIST_MERGE = 0.6;
export const ARM_DISSOLVE_S0 = ARM_HAND_S - 12;
/** foreshortening of the upper arm / forearm at z = 1 */
export const ARM_Z_UPPER = 0.7;
export const ARM_Z_FORE = 0.45;
/** the top of the sleeve (shoulder cap) stays seated on the torso; the swing blends in below it */
export const ARM_STUMP = 90;
/** length of the shoulder bend zone below the stump (sleeve px): the upper arm is rigid beyond it */
export const ARM_SHOULDER_ZONE = 110;

/** rendered width (rig px) of every hand piece's sleeve stub: one cuff size for all gestures */
export const HAND_CUFF_W = 96;
/** base scale of a hand piece's SKIN part; the per-hand `k` (palm-normalised) multiplies it */
export const HAND_BASE = 0.36;

export const smooth01 = (x: number) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

export interface ArmFrame {
  /** hand attach point (rig px), direction of the hand piece's "up" (rad, canvas rotation) */
  hx: number;
  hy: number;
  hPsi: number;
}

export class ArmChain {
  readonly sgn: 1 | -1;
  readonly theta: number;
  readonly u0x: number;
  readonly u0y: number;
  readonly w0x: number;
  readonly w0y: number;
  /** pivot in sleeve (s, n) coordinates */
  readonly sp: number;
  readonly np: number;
  private readonly pivot: readonly [number, number];
  // pose
  a = 0;
  e = 0;
  w = 0;
  z = 0;
  lift = 0;
  /** wrist angle folded into the sleeve / left to the hand piece */
  wEff = 0;
  wRest = 0;
  // derived
  b0 = ARM_ELBOW_S - ARM_BEND_LEN / 2;
  b1 = ARM_ELBOW_S + ARM_BEND_LEN / 2;
  bendLen = ARM_BEND_LEN;
  private bend = 0;
  private fu = 1;
  private ff = 1;
  private pxP = 0;
  private pyP = 0;
  mergeMax = ARM_WRIST_MERGE;
  readonly smin: number;

  constructor(
    g: Pick<ArmGeom, 'sgn' | 'theta' | 's0' | 'smin'>,
    pivot: readonly [number, number],
    off: readonly [number, number],
  ) {
    this.sgn = g.sgn;
    this.theta = g.theta;
    this.smin = g.smin;
    const sinT = Math.sin(g.theta);
    const cosT = Math.cos(g.theta);
    this.u0x = g.sgn * sinT;
    this.u0y = cosT;
    this.w0x = cosT;
    this.w0y = -g.sgn * sinT;
    this.pivot = pivot;
    const plx = pivot[0] - off[0] - g.s0[0];
    const ply = pivot[1] - off[1] - g.s0[1];
    this.sp = plx * this.u0x + ply * this.u0y;
    this.np = plx * this.w0x + ply * this.w0y;
    this.set(0, 0, 0, 0, 0);
  }

  get sgnRot(): number {
    return -this.sgn;
  }

  /** Set the pose (rad) and cache everything the evaluators need. */
  set(a: number, e: number, w: number, z: number, lift: number, mergeMax = ARM_WRIST_MERGE): void {
    this.a = a;
    this.e = e;
    this.w = w;
    this.z = Math.max(0, Math.min(1, z));
    this.lift = lift;
    this.mergeMax = mergeMax;
    this.bend = Math.max(-ARM_BEND_MAX, Math.min(ARM_BEND_MAX, e));
    // rigid hinge: short bend zone so φ jumps at the elbow (upper / fore drawn as pieces)
    this.bendLen = ARM_BEND_LEN;
    this.b0 = ARM_ELBOW_S - this.bendLen / 2;
    this.b1 = ARM_ELBOW_S + this.bendLen / 2;
    this.fu = 1 - ARM_Z_UPPER * this.z;
    this.ff = 1 - ARM_Z_FORE * this.z;
    this.wEff = Math.max(-mergeMax, Math.min(mergeMax, w));
    this.wRest = w - this.wEff;
    // anchor the integration at the pivot row
    const phiP = this.phiOf(this.sp);
    const wx = this.w0x * Math.cos(phiP) - this.w0y * Math.sin(phiP);
    const wy = this.w0x * Math.sin(phiP) + this.w0y * Math.cos(phiP);
    this.pxP = this.pivot[0] - this.np * wx;
    this.pyP = this.pivot[1] + lift - this.np * wy;
  }

  shoulderBlend(s: number): number {
    const stump = Math.max(this.smin + 20, ARM_STUMP);
    return smooth01((s - stump) / ARM_SHOULDER_ZONE);
  }

  /** spine rotation (rad) at s, relative to the rest axis (rigid upper / fore) */
  phi0(s: number): number {
    const sh = this.a * this.shoulderBlend(s);
    // hard hinge at the elbow: fore carries full bend past b1, upper carries none past b0
    let el = 0;
    if (s >= this.b1) el = this.bend;
    else if (s > this.b0) el = this.bend * smooth01((s - this.b0) / this.bendLen);
    return this.sgnRot * (sh + el);
  }

  /** same incl. the wrist share folded into the sleeve end */
  phiOf(s: number): number {
    const wS0 = ARM_TAPER_S1 - 110;
    return this.phi0(s) + this.sgnRot * this.wEff * smooth01((s - wS0) / (ARM_TAPER_S1 - wS0));
  }

  /** length factor (foreshortening) at s */
  lenAt(s: number): number {
    if (this.z <= 0) return 1;
    const stump = Math.max(this.smin + 20, ARM_STUMP);
    if (s >= this.b1) return this.ff;
    if (s > this.b0) return this.fu + (this.ff - this.fu) * smooth01((s - this.b0) / this.bendLen);
    return 1 + (this.fu - 1) * smooth01((s - stump) / 80);
  }

  /** centre-line point at sleeve arc-length s (rigid 2-bone with a short shoulder blend) */
  pos(s: number, out: number[] | Float64Array): void {
    let x = this.pxP;
    let y = this.pyP;
    const steps = Math.max(1, Math.ceil(Math.abs(s - this.sp) / 5));
    const h = (s - this.sp) / steps;
    for (let i = 0; i < steps; i++) {
      const sm = this.sp + h * (i + 0.5);
      const ph = this.phiOf(sm);
      const ls = this.lenAt(sm);
      const c = Math.cos(ph);
      const sn = Math.sin(ph);
      x += (this.u0x * c - this.u0y * sn) * h * ls;
      y += (this.u0x * sn + this.u0y * c) * h * ls;
    }
    out[0] = x;
    out[1] = y;
  }

  /** posed elbow joint (rig px) and the upper / fore rigid angles (rad relative to rest axis) */
  elbowFrame(): { x: number; y: number; phiU: number; phiF: number } {
    const t = [0, 0];
    this.pos(ARM_ELBOW_S, t);
    return {
      x: t[0],
      y: t[1],
      phiU: this.sgnRot * this.a,
      phiF: this.sgnRot * (this.a + this.bend),
    };
  }

  /** hand attach point + piece rotation (the piece is authored fingers-up) */
  hand(out: ArmFrame): void {
    const t = [0, 0];
    this.pos(ARM_HAND_S, t);
    out.hx = t[0];
    out.hy = t[1];
    out.hPsi = this.phiOf(ARM_HAND_S) - this.sgn * this.theta + Math.PI + this.sgnRot * this.wRest;
  }
}

/** the visible rig canvas and the margins the arm must keep while it is posed (rig px) */
export const ARM_STAGE = { w: 960, h: 1120, elbow: 40, hand: 60, palm: 160 } as const;

/**
 * Smallest reach z ≥ `z` for which the posed elbow and the hand (palm centre) stay on the canvas.
 * Solved IK poses are already inside, so they are returned unchanged; only in-between frames of a
 * gesture (shoulder already up, elbow not folded yet) get foreshortened toward the camera instead
 * of sweeping the hand off the stage. Continuous in the pose (bisection on a monotone region).
 */
/**
 * Hand-piece scale while the guard foreshortens the arm: the forearm swinging toward the camera
 * also shortens the hand (≤ 40 %). Exactly 1 for every solved pose (guard inactive: zz = z0).
 */
export function handForeshorten(zGuard: number, zPose: number): number {
  return 1 - 0.4 * Math.max(0, Math.min(1, zGuard - zPose));
}

export function safeReach(
  ch: ArmChain,
  a: number,
  e: number,
  w: number,
  z: number,
  lift: number,
  mergeMax = ARM_WRIST_MERGE,
): [number, number] {
  const el = [0, 0];
  const fr: ArmFrame = { hx: 0, hy: 0, hPsi: 0 };
  const z0 = Math.max(0, Math.min(1, z));
  const bad = (zz: number, aa: number = a): boolean => {
    ch.set(aa, e, w, zz, lift, mergeMax);
    ch.pos(ARM_ELBOW_S, el);
    ch.hand(fr);
    const pl = ARM_STAGE.palm * handForeshorten(zz, z0);
    const px = fr.hx + Math.sin(fr.hPsi) * pl;
    const py = fr.hy - Math.cos(fr.hPsi) * pl;
    const m = ARM_STAGE.elbow;
    const h = ARM_STAGE.hand;
    return (
      el[0] < m ||
      el[0] > ARM_STAGE.w - m ||
      el[1] < m ||
      el[1] > ARM_STAGE.h - m ||
      px < h ||
      px > ARM_STAGE.w - h ||
      py < h ||
      py > ARM_STAGE.h - h
    );
  };
  if (!bad(z0)) return [a, z0];
  let lo = z0;
  let hi = 1;
  // coarse scan for the first safe z, then bisect the bracket
  let found = false;
  for (let k = 1; k <= 10; k++) {
    const zz = z0 + ((1 - z0) * k) / 10;
    if (!bad(zz)) {
      hi = zz;
      lo = z0 + ((1 - z0) * (k - 1)) / 10;
      found = true;
      break;
    }
  }
  if (!found) {
    // fully foreshortened is the best the guard can do (the animation keys keep the shoulder in
    // until the forearm has passed the horizontal)
    return [a, 1];
  }
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (bad(mid)) lo = mid;
    else hi = mid;
  }
  return [a, hi];
}

/** z-only view of {@link safeReach} (kept for callers that never swing the shoulder). */
export function safeReachZ(
  ch: ArmChain,
  a: number,
  e: number,
  w: number,
  z: number,
  lift: number,
  mergeMax = ARM_WRIST_MERGE,
): number {
  return safeReach(ch, a, e, w, z, lift, mergeMax)[1];
}
