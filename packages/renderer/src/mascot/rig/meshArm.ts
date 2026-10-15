/**
 * Posed arm for the Nomi 2D rig (Canvas2D only).
 *
 * The master arm layer (the sleeve cut from the approved artwork) is split once into three softly
 * masked, overlapping pieces: shoulder seam, upper arm and forearm. The upper arm and forearm
 * both end in a round cap centred on the elbow, so a bent elbow keeps a smooth sleeve outline, and
 * the pocket / strap on the upper arm stay rigid. A hand piece is attached to the forearm. Nothing
 * here generates art: every pixel comes from the master sleeve or the hand pieces. When no
 * gesture is active the animator draws the untouched master arm layer instead.
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
  /** forearm foreshortening while the arm swings (0..1; 1 = shortened by FORE_MAX) */
  fore: number;
}

/** Spine arc-length of the elbow joint and of the point where the hand piece attaches. */
export const ARM_ELBOW_S = 335;
export const ARM_HAND_S = 470;
export const HAND_SCALE = 0.6;
/** the shoulder seam / drop-shoulder flap follows the raised arm only this much (stays on the torso) */
export const SHOULDER_FOLLOW = 1;
/** the forearm and hand are drawn this much shorter at full swing speed (it moves toward the camera) */
export const FORE_MAX = 0.6;

const smooth01 = (x: number) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Src = RigImageSource | CanvasImageSource;

interface ArmTex {
  /** shoulder seam piece (fades out below the shoulder) */
  shoulder: Src;
  /** upper arm incl. a round elbow cap (fades in below the shoulder seam) */
  upper: Src;
  /** forearm from the elbow, with its own round cap */
  fore: Src;
  /** elbow joint in layer px */
  jx: number;
  jy: number;
}

const texCache = new WeakMap<object, ArmTex | null>();

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  return typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

/**
 * The master sleeve is cut into three overlapping pieces once (alpha masks only, every colour
 * stays the master's): shoulder seam, upper arm and forearm. The upper arm and the forearm end in
 * round caps centred on the elbow joint, so the bent elbow keeps a smooth sleeve outline and the
 * pocket / strap on the upper arm stay rigid instead of being stretched by a bend.
 */
function buildTex(img: RigImageSource, g: ArmGeom, sEnd: number): ArmTex | null {
  try {
    const iw = (img as { width: number }).width;
    const ih = (img as { height: number }).height;
    const c0 = makeCanvas(iw, ih);
    const x0 = c0.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    x0.drawImage(img as CanvasImageSource, 0, 0);
    const src = x0.getImageData(0, 0, iw, ih);
    if (!src || !src.data || src.data.length !== iw * ih * 4) return null;
    const sinT = Math.sin(g.theta);
    const cosT = Math.cos(g.theta);
    const ux = g.sgn * sinT;
    const uy = cosT;
    const wx = cosT;
    const wy = -g.sgn * sinT;
    const J = ARM_ELBOW_S;
    const sOf = (x: number, y: number) => (x - g.s0[0]) * ux + (y - g.s0[1]) * uy;
    const nOf = (x: number, y: number) => (x - g.s0[0]) * wx + (y - g.s0[1]) * wy;
    // sleeve extent at the elbow
    let nLo = 1e9;
    let nHi = -1e9;
    for (let y = 0; y < ih; y += 1)
      for (let x = 0; x < iw; x += 1) {
        if (src.data[(y * iw + x) * 4 + 3] < 128) continue;
        if (Math.abs(sOf(x, y) - J) > 5) continue;
        const n = nOf(x, y);
        if (n < nLo) nLo = n;
        if (n > nHi) nHi = n;
      }
    if (nLo > nHi) return null;
    const nC = (nLo + nHi) / 2;
    const R = (nHi - nLo) / 2 + 3;
    const mk = (f: (s: number, n: number) => number) => {
      const out = new Uint8ClampedArray(src.data);
      for (let y = 0; y < ih; y++)
        for (let x = 0; x < iw; x++) {
          const k = (y * iw + x) * 4 + 3;
          if (!out[k]) continue;
          out[k] = Math.round(out[k] * f(sOf(x, y), nOf(x, y)));
        }
      const c = makeCanvas(iw, ih);
      const cx = c.getContext('2d') as CanvasRenderingContext2D;
      cx.putImageData(new ImageData(out, iw, ih), 0, 0);
      return c as unknown as Src;
    };
    const cap = (s: number, n: number) =>
      Math.max(0, Math.min(1, (R - Math.hypot(s - J, n - nC)) / 10));
    return {
      shoulder: mk((s) => 1 - smooth01((s - 110) / 130)),
      upper: mk(
        (s, n) => (SHOULDER_FOLLOW >= 1 ? 1 : smooth01((s - 20) / 130)) * (s <= J ? 1 : cap(s, n)),
      ),
      fore: mk((s, n) => (s >= J ? 1 - smooth01((s - (sEnd - 26)) / 26) : cap(s, n))),
      jx: g.s0[0] + J * ux + nC * wx,
      jy: g.s0[1] + J * uy + nC * wy,
    };
  } catch {
    return null;
  }
}

export interface ArmFrame {
  /** hand attach point (rig px), direction of the forearm (rad, canvas rotation from straight down) */
  hx: number;
  hy: number;
  hPsi: number;
  /** forearm length factor (1 = full) */
  fore: number;
}
export const armFrame: ArmFrame = { hx: 0, hy: 0, hPsi: 0, fore: 1 };

/**
 * Draw one posed arm as three rigid, softly masked pieces of the master sleeve (see buildTex).
 * `pivot` is the shoulder pivot and `off` the layer offset, both in rig px. The hand frame is
 * returned through the shared `armFrame` object.
 */
export function drawArmPieces(
  ctx: Ctx,
  img: RigImageSource,
  g: ArmGeom,
  pivot: readonly [number, number],
  off: readonly [number, number],
  p: ArmDrawParams,
  sEnd: number,
): void {
  let tex = texCache.get(img as object);
  if (tex === undefined) {
    tex = buildTex(img, g, sEnd);
    texCache.set(img as object, tex);
  }
  const sgn = g.sgn;
  const rotSign = -sgn;
  const phiU = rotSign * p.a;
  const phiS = phiU * SHOULDER_FOLLOW;
  const phiF = rotSign * (p.a + p.e);
  const px = pivot[0];
  const py = pivot[1] + p.lift;
  const sinT = Math.sin(g.theta);
  const cosT = Math.cos(g.theta);
  const ux = sgn * sinT;
  const uy = cosT;
  const base = img as unknown as CanvasImageSource;
  const piece = (im: Src, phi: number) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(phi);
    ctx.translate(-pivot[0], -pivot[1]);
    ctx.drawImage(im as CanvasImageSource, off[0], off[1]);
    ctx.restore();
  };
  // elbow joint (layer px → rig px, unrotated) and its position after the upper arm rotates
  const jx = off[0] + (tex ? tex.jx : g.s0[0] + ARM_ELBOW_S * ux);
  const jy = off[1] + (tex ? tex.jy : g.s0[1] + ARM_ELBOW_S * uy);
  const cu = Math.cos(phiU);
  const su = Math.sin(phiU);
  const jrx = px + (jx - pivot[0]) * cu - (jy - pivot[1]) * su;
  const jry = py + (jx - pivot[0]) * su + (jy - pivot[1]) * cu;
  if (tex && SHOULDER_FOLLOW < 1) piece(tex.shoulder, phiS);
  piece(tex ? tex.upper : base, phiU);
  // forearm: rotate about the elbow, foreshortened along its own axis while the arm swings
  const ff = 1 - FORE_MAX * Math.max(0, Math.min(1, p.fore));
  const ax = ff - 1;
  // matrix I + (ff-1)·u·uᵀ in the sleeve's own frame (u = spine direction)
  const m00 = 1 + ax * ux * ux;
  const m01 = ax * ux * uy;
  const m11 = 1 + ax * uy * uy;
  ctx.save();
  ctx.translate(jrx, jry);
  ctx.rotate(phiF);
  ctx.transform(m00, m01, m01, m11, 0, 0);
  ctx.translate(-jx, -jy);
  ctx.drawImage((tex ? tex.fore : base) as CanvasImageSource, off[0], off[1]);
  ctx.restore();
  // hand frame: the point of the spine at ARM_HAND_S, carried by the forearm
  const dx = off[0] + g.s0[0] + ARM_HAND_S * ux - jx;
  const dy = off[1] + g.s0[1] + ARM_HAND_S * uy - jy;
  const hx0 = m00 * dx + m01 * dy;
  const hy0 = m01 * dx + m11 * dy;
  const cf = Math.cos(phiF);
  const sf = Math.sin(phiF);
  armFrame.hx = jrx + hx0 * cf - hy0 * sf;
  armFrame.hy = jry + hx0 * sf + hy0 * cf;
  armFrame.hPsi = phiF - sgn * g.theta + Math.PI + rotSign * p.w;
  armFrame.fore = ff;
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
  ctx.scale(sgn * scale, scale * armFrame.fore);
  ctx.drawImage(img, -meta.ax, -meta.ay);
  ctx.restore();
  ctx.globalAlpha = prev;
}
