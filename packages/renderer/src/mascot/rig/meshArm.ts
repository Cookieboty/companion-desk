/**
 * Mesh-warped arm for the Nomi 2D rig (Canvas2D only).
 *
 * The master arm layer (the sleeve cut from the approved artwork) is re-drawn as a strip of
 * triangles that follow a bendable spine: the shoulder rotates the whole strip, the elbow bends it
 * smoothly (inner side folds, outer side stretches). A hand piece is attached at the strip end with a
 * feathered seam. Nothing here generates art: every pixel comes from the master sleeve or the hand
 * pieces. When no gesture is active the animator draws the untouched master arm layer instead.
 */

import type { RigImageSource } from './rigTypes';

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

export interface HandPieceMeta {
  file: string;
  w: number;
  h: number;
  /** attach point (bottom centre of the sleeve) in piece px */
  ax: number;
  ay: number;
  sleeveW: number;
  cuffY: number;
}

export interface ArmDrawParams {
  /** shoulder lift outward/up (rad) incl. idle sway */
  a: number;
  /** elbow bend (rad) */
  e: number;
  /** wrist twist (rad) */
  w: number;
  /** shoulder vertical lift (rig px, from breathing) */
  lift: number;
  /** hand piece alpha 0..1 */
  handAlpha: number;
}

/** Spine arc-length of the shoulder joint, the elbow, and where the hand piece attaches. */
export const ARM_ELBOW_S = 335;
export const ARM_BEND_LEN = 120;
export const ARM_HAND_S = 470;
export const HAND_SCALE = 0.6;

const MAX_ROWS = 40;
const COLS = 6;
const rowS = new Float64Array(MAX_ROWS);
const rowPx = new Float64Array(MAX_ROWS);
const rowPy = new Float64Array(MAX_ROWS);
const rowPhi = new Float64Array(MAX_ROWS);
const rowK = new Float64Array(MAX_ROWS);
const dstX = new Float64Array(MAX_ROWS * (COLS + 1));
const dstY = new Float64Array(MAX_ROWS * (COLS + 1));
const srcX = new Float64Array(MAX_ROWS * (COLS + 1));
const srcY = new Float64Array(MAX_ROWS * (COLS + 1));

const smooth01 = (x: number) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draw one source triangle mapped onto a destination triangle (affine), slightly expanded to hide seams. */
function tri(
  ctx: Ctx,
  img: RigImageSource,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  dx0: number,
  dy0: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
): void {
  const det = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (Math.abs(det) < 1e-6) return;
  const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / det;
  const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / det;
  const c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / det;
  const d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / det;
  const e = dx0 - a * sx0 - c * sy0;
  const f = dy0 - b * sx0 - d * sy0;
  // expand the clip triangle ~0.6px from its centroid so neighbours overlap (no hairline gaps)
  const cx = (dx0 + dx1 + dx2) / 3;
  const cy = (dy0 + dy1 + dy2) / 3;
  const ex = (x: number, y: number, out: number[]) => {
    const vx = x - cx;
    const vy = y - cy;
    const l = Math.hypot(vx, vy) || 1;
    out[0] = x + (vx / l) * 0.7;
    out[1] = y + (vy / l) * 0.7;
  };
  ex(dx0, dy0, T0);
  ex(dx1, dy1, T1);
  ex(dx2, dy2, T2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(T0[0], T0[1]);
  ctx.lineTo(T1[0], T1[1]);
  ctx.lineTo(T2[0], T2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
const T0 = [0, 0];
const T1 = [0, 0];
const T2 = [0, 0];

export interface ArmFrame {
  /** hand attach point (rig px), direction of the forearm (rad, canvas rotation from straight down) */
  hx: number;
  hy: number;
  hPsi: number;
}
export const armFrame: ArmFrame = { hx: 0, hy: 0, hPsi: 0 };

/**
 * Build rows + draw the strip. `pivot` is the shoulder pivot and `off` the layer offset, both in rig px.
 * Returns the hand frame via the shared `armFrame` object.
 */
export function drawArmStrip(
  ctx: Ctx,
  img: RigImageSource,
  g: ArmGeom,
  pivot: readonly [number, number],
  off: readonly [number, number],
  p: ArmDrawParams,
  sEnd: number,
): void {
  const sgn = g.sgn;
  const sinT = Math.sin(g.theta);
  const cosT = Math.cos(g.theta);
  const u0x = sgn * sinT;
  const u0y = cosT;
  const w0x = cosT;
  const w0y = -sgn * sinT;
  // pivot in (s, n)
  const plx = pivot[0] - off[0] - g.s0[0];
  const ply = pivot[1] - off[1] - g.s0[1];
  const sp = plx * u0x + ply * u0y;
  const np = plx * w0x + ply * w0y;

  // rows
  let n = 0;
  const smin = g.smin;
  const se = Math.min(sEnd, g.smax);
  const b0 = ARM_ELBOW_S - ARM_BEND_LEN / 2;
  const b1 = ARM_ELBOW_S + ARM_BEND_LEN / 2;
  const push = (s: number) => {
    if (n < MAX_ROWS && s > (n ? rowS[n - 1] + 1 : -1e9) && s <= se + 0.001) rowS[n++] = s;
  };
  push(smin);
  for (const s of [60, 120, 180, 230]) if (s > smin && s < b0) push(s);
  for (let s = b0; s <= b1 + 0.1; s += ARM_BEND_LEN / 8) push(s);
  for (let s = b1 + 55; s < se; s += 55) push(s);
  push(se);

  const bend = p.e;
  const absBend = Math.abs(bend);
  const innerSign = sgn * (bend >= 0 ? 1 : -1);
  const sgnRot = -sgn;
  // rotation (canvas) as a function of s
  const phiOf = (s: number) => sgnRot * (p.a + bend * smooth01((s - b0) / ARM_BEND_LEN));
  // spine integration from the pivot
  const phiP = phiOf(sp);
  const wx = w0x * Math.cos(phiP) - w0y * Math.sin(phiP);
  const wy = w0x * Math.sin(phiP) + w0y * Math.cos(phiP);
  const pxP = pivot[0] - np * wx;
  const pyP = pivot[1] + p.lift - np * wy;
  // find row nearest to sp to anchor; integrate outward in both directions
  const ux = (phi: number) => u0x * Math.cos(phi) - u0y * Math.sin(phi);
  const uy = (phi: number) => u0x * Math.sin(phi) + u0y * Math.cos(phi);
  // integrate with fine steps (4px) so the arc is smooth regardless of rows
  const pos = (s: number, out: number[]) => {
    let x = pxP;
    let y = pyP;
    const dir = s >= sp ? 1 : -1;
    const steps = Math.max(1, Math.ceil(Math.abs(s - sp) / 6));
    const h = (s - sp) / steps;
    for (let i = 0; i < steps; i++) {
      const sm = sp + h * (i + 0.5);
      const ph = phiOf(sm);
      x += ux(ph) * h;
      y += uy(ph) * h;
    }
    out[0] = x;
    out[1] = y;
    return dir;
  };
  const tmp = [0, 0];
  for (let i = 0; i < n; i++) {
    const s = rowS[i];
    pos(s, tmp);
    rowPx[i] = tmp[0];
    rowPy[i] = tmp[1];
    rowPhi[i] = phiOf(s);
    // curvature magnitude (rad / px) of the bend at s
    const x = (s - b0) / ARM_BEND_LEN;
    rowK[i] = x > 0 && x < 1 ? (absBend * 6 * x * (1 - x)) / ARM_BEND_LEN : 0;
  }
  // mesh vertices
  for (let i = 0; i < n; i++) {
    const phi = rowPhi[i];
    const cw = Math.cos(phi);
    const sw = Math.sin(phi);
    const wx2 = w0x * cw - w0y * sw;
    const wy2 = w0x * sw + w0y * cw;
    for (let j = 0; j <= COLS; j++) {
      const nn = g.nmin + ((g.nmax - g.nmin) * j) / COLS;
      let ne = nn;
      const m = nn * innerSign;
      if (m > 0 && rowK[i] > 0) ne = (m / (1 + m * rowK[i])) * innerSign;
      const k = i * (COLS + 1) + j;
      dstX[k] = rowPx[i] + ne * wx2;
      dstY[k] = rowPy[i] + ne * wy2;
      srcX[k] = g.s0[0] + rowS[i] * u0x + nn * w0x;
      srcY[k] = g.s0[1] + rowS[i] * u0y + nn * w0y;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < COLS; j++) {
      const a = i * (COLS + 1) + j;
      const b = a + 1;
      const c = a + (COLS + 1);
      const d = c + 1;
      tri(
        ctx,
        img,
        srcX[a],
        srcY[a],
        srcX[b],
        srcY[b],
        srcX[c],
        srcY[c],
        dstX[a],
        dstY[a],
        dstX[b],
        dstY[b],
        dstX[c],
        dstY[c],
      );
      tri(
        ctx,
        img,
        srcX[b],
        srcY[b],
        srcX[d],
        srcY[d],
        srcX[c],
        srcY[c],
        dstX[b],
        dstY[b],
        dstX[d],
        dstY[d],
        dstX[c],
        dstY[c],
      );
    }
  }
  // hand frame at ARM_HAND_S
  pos(ARM_HAND_S, tmp);
  armFrame.hx = tmp[0];
  armFrame.hy = tmp[1];
  armFrame.hPsi = phiOf(ARM_HAND_S) - sgn * g.theta + Math.PI + sgnRot * p.w;
}

/** Draw a hand piece at the attach frame (call right after drawArmStrip). */
export function drawHandPiece(
  ctx: Ctx,
  img: RigImageSource,
  meta: HandPieceMeta,
  sgn: 1 | -1,
  alpha: number,
  scale = HAND_SCALE,
): void {
  if (alpha <= 0.004) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.save();
  ctx.translate(armFrame.hx, armFrame.hy);
  ctx.rotate(armFrame.hPsi);
  ctx.scale(sgn * scale, scale);
  ctx.drawImage(img, -meta.ax, -meta.ay);
  ctx.restore();
  ctx.globalAlpha = prev;
}
