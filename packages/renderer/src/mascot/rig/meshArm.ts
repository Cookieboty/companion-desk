/**
 * Mesh-warped arm for the Nomi 2D rig (Canvas2D only).
 *
 * The master arm layer (the sleeve cut from the approved artwork) is re-drawn as a strip of
 * triangles that follow a bendable spine: the shoulder rotates the whole strip, the elbow bends it
 * smoothly (inner side folds, outer side stretches). A hand piece is attached at the strip end with a
 * feathered seam. Nothing here generates art: every pixel comes from the master sleeve or the hand
 * pieces. When no gesture is active the animator draws the untouched master arm layer instead.
 */

import {
  ARM_BEND_MAX as ARM_BEND_MAX_LOCAL,
  ARM_WRIST_MERGE as ARM_WRIST_MERGE_LOCAL,
  ARM_DISSOLVE_S0,
  ARM_TAPER_S0,
  ARM_TAPER_S1,
  ArmChain,
  type ArmFrame,
  type ArmGeom,
  ARM_ELBOW_S,
  ARM_HAND_S,
  HAND_BASE,
  HAND_CUFF_W,
  smooth01,
} from './armKin';
import type { RigImageSource } from './rigTypes';

export * from './armKin';

export interface HandPieceMeta {
  file: string;
  w: number;
  h: number;
  /** attach point (bottom centre of the sleeve) in piece px */
  ax: number;
  ay: number;
  sleeveW: number;
  cuffY: number;
  /** palm-normalising multiplier on HAND_BASE (default 1) */
  k?: number;
  /** native chirality of the artwork: the character's left / right hand, S = symmetric */
  side?: 'L' | 'R' | 'S';
  cx?: number;
  cy?: number;
}

export interface ArmDrawParams {
  /** shoulder swing (rad, + = outward / up) incl. idle sway */
  a: number;
  /** elbow flexion (rad) */
  e: number;
  /** wrist (rad) */
  w: number;
  /** reach toward the camera 0..1 (foreshortens the limb) */
  z: number;
  /** shoulder vertical lift (rig px, from breathing) */
  lift: number;
  /**
   * Target sleeve width (rig px) at the wrist. When set the mesh tapers to it and the wrist
   * bend is folded into the forearm itself, so the sleeve is one continuous cloth that ends
   * exactly under the hand piece's sleeve (no rigid rotated stub, no soft fade needed).
   */
  endW?: number;
  /** 0..1 how far the sleeve has tapered towards `endW` (follows the hand piece fade-in) */
  mix?: number;
  /** compute the hand frame only (no pixels) so the hand piece can be drawn first */
  dry?: boolean;
  /** draw only the mesh rows beyond this s (re-draw the sleeve end over the hand piece) */
  fromS?: number;
  /** max wrist angle (rad) folded into the sleeve (default ARM_WRIST_MERGE) */
  mergeMax?: number;
  /** merged mode without the dissolve: the sleeve end is cut hard and tucked under the piece */
  hardEnd?: boolean;
}

/** mitre plane offset along the bend bisector (px) — keeps the strap hardware on one piece */
const MITRE_SHIFT = 0;
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

interface ArmProfile {
  step: number;
  s0: number;
  /** silhouette width / centre (arm-layer n units) per s sample */
  w: Float32Array;
  c: Float32Array;
}
const profCache = new WeakMap<object, ArmProfile | null>();

/** Real sleeve silhouette (lateral extent of opaque pixels) along the arm axis. Cached per arm image. */
function armProfile(img: RigImageSource, g: ArmGeom): ArmProfile | null {
  const hit = profCache.get(img as object);
  if (hit !== undefined) return hit;
  let out: ArmProfile | null;
  try {
    const iw = (img as { width: number }).width;
    const ih = (img as { height: number }).height;
    const cv =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(iw, ih)
        : Object.assign(document.createElement('canvas'), { width: iw, height: ih });
    const cx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    cx.drawImage(img as CanvasImageSource, 0, 0);
    const d = cx.getImageData(0, 0, iw, ih).data;
    const sinT = Math.sin(g.theta);
    const cosT = Math.cos(g.theta);
    const ux = g.sgn * sinT;
    const uy = cosT;
    const wx = cosT;
    const wy = -g.sgn * sinT;
    const step = 6;
    const s0 = Math.floor(g.smin);
    const cnt = Math.ceil((g.smax - s0) / step) + 1;
    const w = new Float32Array(cnt);
    const c = new Float32Array(cnt);
    const mid = (g.nmin + g.nmax) / 2;
    const full = Math.abs(g.nmax - g.nmin);
    for (let i = 0; i < cnt; i++) {
      const s = s0 + i * step;
      let lo = 1e9;
      let hi = -1e9;
      for (let n = g.nmin - 20; n <= g.nmax + 20; n += 1.5) {
        const x = Math.round(g.s0[0] + s * ux + n * wx);
        const y = Math.round(g.s0[1] + s * uy + n * wy);
        if (x < 0 || y < 0 || x >= iw || y >= ih) continue;
        if (d[(y * iw + x) * 4 + 3] > 110) {
          if (n < lo) lo = n;
          if (n > hi) hi = n;
        }
      }
      if (hi > lo + 20) {
        w[i] = hi - lo;
        c[i] = (hi + lo) / 2;
      } else {
        w[i] = full;
        c[i] = mid;
      }
    }
    out = { step, s0, w, c };
  } catch {
    out = null;
  }
  profCache.set(img as object, out);
  return out;
}
const profAt = (pr: ArmProfile, arr: Float32Array, s: number): number => {
  const f = Math.max(0, Math.min(arr.length - 1.001, (s - pr.s0) / pr.step));
  const i = Math.floor(f);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
};

export const armFrame: ArmFrame = { hx: 0, hy: 0, hPsi: 0 };

const chains = new WeakMap<object, ArmChain>();
/** One reusable chain per arm layer image (the pose is re-set every call). */
export function chainFor(
  key: object,
  g: ArmGeom,
  pivot: readonly [number, number],
  off: readonly [number, number],
): ArmChain {
  let c = chains.get(key);
  if (!c || c.sgn !== g.sgn || c.theta !== g.theta) {
    c = new ArmChain(g, pivot, off);
    chains.set(key, c);
  }
  return c;
}

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
  const merged = p.endW !== undefined;
  const mix = merged ? Math.max(0, Math.min(1, p.mix ?? 1)) : 0;
  const ch = chainFor(img as object, g, pivot, off);
  ch.set(p.a, p.e, p.w, p.z, p.lift, merged ? (p.mergeMax ?? ARM_WRIST_MERGE_LOCAL) : 0);
  const sgn = g.sgn;
  const { u0x, u0y, w0x, w0y, b0, b1, bendLen } = ch;
  const bend = Math.max(-ARM_BEND_MAX_LOCAL, Math.min(ARM_BEND_MAX_LOCAL, p.e));
  const absBend = Math.abs(bend);
  const innerSign = sgn * (bend >= 0 ? 1 : -1);

  // rows
  let n = 0;
  const smin = g.smin;
  const se = Math.min(sEnd, g.smax);
  const push = (s: number) => {
    if (n < MAX_ROWS && s > (n ? rowS[n - 1] + 1 : -1e9) && s <= se + 0.001) rowS[n++] = s;
  };
  push(smin);
  for (const s of [60, 120, 180, 230, 280]) if (s > smin && s < b0 - 20) push(s);
  for (let s = b0; s <= b1 + 0.1; s += bendLen / 9) push(s);
  for (let s = b1 + 30; s < (merged ? ARM_DISSOLVE_S0 - 4 : se - 6); s += 30) push(s);
  if (merged) for (let s = ARM_DISSOLVE_S0; s < se; s += 4) push(s);
  push(se);

  const tmp = [0, 0];
  for (let i = 0; i < n; i++) {
    const s = rowS[i];
    ch.pos(s, tmp);
    rowPx[i] = tmp[0];
    rowPy[i] = tmp[1];
    rowPhi[i] = ch.phiOf(s);
    // curvature magnitude (rad / px) of the bend at s
    const x = (s - b0) / bendLen;
    rowK[i] = x > 0 && x < 1 ? (absBend * 6 * x * (1 - x)) / bendLen : 0;
  }
  const prof = merged ? armProfile(img, g) : null;
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
      if (merged) {
        const mt = smooth01((rowS[i] - ARM_TAPER_S0) / (ARM_TAPER_S1 - ARM_TAPER_S0)) * mix;
        const sw0 = prof ? profAt(prof, prof.w, rowS[i]) : Math.abs(g.nmax - g.nmin);
        const nc = prof ? profAt(prof, prof.c, rowS[i]) : (g.nmin + g.nmax) / 2;
        // squeeze the *real* sleeve silhouette to the hand piece's sleeve width, centred on the spine
        const tau = 1 - (1 - (p.endW as number) / sw0) * mt;
        ne = nc * (1 - mt) + (ne - nc) * tau;
      }
      const k = i * (COLS + 1) + j;
      dstX[k] = rowPx[i] + ne * wx2;
      dstY[k] = rowPy[i] + ne * wy2;
      srcX[k] = g.s0[0] + rowS[i] * u0x + nn * w0x;
      srcY[k] = g.s0[1] + rowS[i] * u0y + nn * w0y;
    }
  }
  if (!p.dry)
    for (let i = 0; i < n - 1; i++) {
      if (p.fromS !== undefined && rowS[i + 1] <= p.fromS) continue;
      const prevA = ctx.globalAlpha;
      if (merged) {
        const sm = (rowS[i] + rowS[i + 1]) / 2;
        if (!p.hardEnd)
          ctx.globalAlpha =
            prevA *
            (1 - mix * smooth01((sm - ARM_DISSOLVE_S0) / Math.max(1, se - ARM_DISSOLVE_S0)));
      }
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
      ctx.globalAlpha = prevA;
    }
  ch.hand(armFrame);
}

/**
 * The shipped hand plates are paler and have much lighter linework than the face art
 * (skin ≈ 252,225,210 vs the face's 251,215,195; outline ≈ 140,99,79 vs 69,44,32). Re-grade them
 * ONCE per image (cached) so a raised hand matches the face: skin tone multiplied onto the face
 * colour, outline darkened to the face's line weight, pale fringe pixels pulled toward skin.
 * Only the hand above the cuff is touched; the white sleeve stub keeps its colour.
 */
const FACE_SKIN: readonly [number, number, number] = [251.4, 215.1, 195];
const HAND_SKIN: readonly [number, number, number] = [252, 225.1, 209.9];
const gradedHands = new WeakMap<object, RigImageSource>();
function gradedHand(img: RigImageSource, meta: HandPieceMeta): RigImageSource {
  const hit = gradedHands.get(img as object);
  if (hit) return hit;
  let out: RigImageSource;
  try {
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    const c: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.drawImage(img as CanvasImageSource, 0, 0);
    const d = g.getImageData(0, 0, w, h);
    const px = d.data;
    const cuff = meta.cuffY || meta.ay * 0.6;
    const kr = FACE_SKIN[0] / HAND_SKIN[0];
    const kg = FACE_SKIN[1] / HAND_SKIN[1];
    const kb = FACE_SKIN[2] / HAND_SKIN[2];
    for (let y = 0; y < h; y++) {
      const wy = y <= cuff ? 1 : Math.max(0, 1 - (y - cuff) / 30);
      if (wy <= 0) continue;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = px[i + 3];
        if (a < 4) continue;
        let r = px[i];
        let gg = px[i + 1];
        let b = px[i + 2];
        r += (r * kr - r) * wy;
        gg += (gg * kg - gg) * wy;
        b += (b * kb - b) * wy;
        const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
        // outline: darken toward the face's line weight (skin ≳ 200 is left alone)
        const t = Math.max(0, Math.min(1, (lum - 70) / 130));
        const f = 1 - wy * 0.5 * (1 - t * t * (3 - 2 * t));
        r *= f;
        gg *= f;
        b *= f;
        // pale anti-alias fringe → skin tone, so the hand has no white halo
        if (a < 240) {
          const fr = 1 - wy * 0.1 * (1 - a / 240);
          r *= fr;
          gg *= fr;
          b *= fr;
        }
        px[i] = r;
        px[i + 1] = gg;
        px[i + 2] = b;
      }
    }
    // contour: the plates carry only a hairline (and a pale halo) at the silhouette, which
    // vanishes at hand scale. Add a thin dark-brown line just outside the alpha edge (cached).
    const R = 4;
    const al = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) al[i] = px[i * 4 + 3];
    const hz = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let k = Math.max(0, x - R); k <= Math.min(w - 1, x + R); k++) {
          const v = al[y * w + k];
          if (v > m) m = v;
        }
        hz[y * w + x] = m;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const wy = y <= cuff - 90 ? 1 : Math.max(0, (cuff - y) / 90);
        if (wy <= 0) continue;
        let m = 0;
        for (let k = Math.max(0, y - R); k <= Math.min(h - 1, y + R); k++) {
          const v = hz[k * w + x];
          if (v > m) m = v;
        }
        const i = (y * w + x) * 4;
        const a = px[i + 3] / 255;
        const oa = (m / 255) * 0.75 * wy * (1 - a);
        if (oa <= 0.003) continue;
        const na = a + oa;
        px[i] = (px[i] * a + 88 * oa) / na;
        px[i + 1] = (px[i + 1] * a + 56 * oa) / na;
        px[i + 2] = (px[i + 2] * a + 44 * oa) / na;
        px[i + 3] = na * 255;
      }
    }
    g.putImageData(d, 0, 0);
    out = c as unknown as RigImageSource;
  } catch {
    out = img;
  }
  gradedHands.set(img as object, out);
  return out;
}

/** Scale of the hand (skin) part of a piece; every variant is fitted to the same palm size. */
export function handScaleFor(meta: HandPieceMeta): number {
  return HAND_BASE * (meta.k ?? 1);
}

/** Sleeve-end width the mesh tapers to (matches the rendered stub of every hand piece). */
export const sleeveEndWidth = (): number => HAND_CUFF_W * 1.06;

/**
 * Scale (0.5..1) that keeps the whole hand (wrist → fingertips) inside the visible canvas: an arm
 * passing through the wide-open pose mid-gesture would otherwise push its fingers past the edge.
 * Exactly 1 for every solved pose (they sit well inside), so it only acts on in-between frames.
 */
export function handFitScale(meta: HandPieceMeta, scale: number, w: number, h: number, margin = 22): number {
  const len = meta.ay * scale;
  const dx = Math.sin(armFrame.hPsi);
  const dy = -Math.cos(armFrame.hPsi);
  let k = 1;
  if (dx > 1e-3) k = Math.min(k, (w - margin - armFrame.hx) / (len * dx));
  else if (dx < -1e-3) k = Math.min(k, (armFrame.hx - margin) / (-len * dx));
  if (dy > 1e-3) k = Math.min(k, (h - margin - armFrame.hy) / (len * dy));
  else if (dy < -1e-3) k = Math.min(k, (armFrame.hy - margin) / (-len * dy));
  k = Math.max(0.5, Math.min(1, k));
  // at the 0.5 floor the fingertips can still reach the edge: nudge the attach point inward
  // (a few px at most, only on the in-between frames of a very wide pass) so the hand stays whole
  const tipX = armFrame.hx + len * k * dx;
  const tipY = armFrame.hy + len * k * dy;
  const sx = tipX > w - margin ? w - margin - tipX : tipX < margin ? margin - tipX : 0;
  const sy = tipY > h - margin ? h - margin - tipY : tipY < margin ? margin - tipY : 0;
  armFrame.hx += sx;
  armFrame.hy += sy;
  return k;
}

/**
 * Draw a hand piece at the attach frame (call right after drawArmStrip). The piece is drawn in two
 * slices: the hand (skin) at the palm-normalised scale and the sleeve stub below the cuff line at the
 * common cuff width, so a cuff never changes size when the gesture (hand shape) changes.
 */
export function drawHandPiece(
  ctx: Ctx,
  img: RigImageSource,
  meta: HandPieceMeta,
  /** −1 mirrors the piece (it depicts the other hand than this arm's own) */
  flip: 1 | -1,
  alpha: number,
  scale = HAND_BASE,
  /** keep only this many source px of sleeve below the cuff line (bilateral prayer joint) */
  keepBelowCuff?: number,
): void {
  if (alpha <= 0.004) return;
  // the hand is fully opaque from 60% mix on (no long semi-transparent ghost while it fades in/out)
  alpha = smooth01(Math.min(1, alpha / 0.6));
  img = gradedHand(img, meta);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.save();
  ctx.translate(armFrame.hx, armFrame.hy);
  ctx.rotate(armFrame.hPsi);
  const cuffY = meta.cuffY || meta.ay * 0.6;
  const sxCuff = HAND_CUFF_W / Math.max(40, meta.sleeveW || 160);
  // sleeve slice scale in x; keeps the stub's centre line on the arm axis
  const yb = keepBelowCuff !== undefined ? Math.min(meta.ay, cuffY + keepBelowCuff) : meta.ay;
  // overlap one source row so the two slices never leave a hairline
  const cut = Math.round(cuffY);
  const cuffLift = keepBelowCuff !== undefined ? 0 : Math.max(0, (meta.ay - cuffY) * 0.2);
  ctx.translate(0, cuffLift * scale);
  // stub (below the cuff line): widens from the hand's own rim to the common cuff width
  const rows = Math.max(1, yb - cut);
  const N = Math.max(4, Math.min(12, Math.round(rows / 16)));
  // start the stub already close to the cuff width so the wrist is not a thin plug
  const sx0 = scale + (sxCuff - scale) * 0.55;
  for (let i = 0; i < N; i++) {
    const y0 = cut + (rows * i) / N;
    const y1 = cut + (rows * (i + 1)) / N;
    const sx = sx0 + (sxCuff - sx0) * smooth01((i + 0.5) / N);
    ctx.save();
    ctx.scale(flip * sx, scale);
    const sy0 = Math.max(cut - 1, Math.floor(y0) - (i ? 1 : 0));
    const sh = Math.min(meta.ay, Math.ceil(y1)) - sy0;
    ctx.drawImage(img, 0, sy0, meta.w, sh, -meta.ax, sy0 - meta.ay, meta.w, sh);
    ctx.restore();
  }
  // hand
  ctx.save();
  ctx.scale(flip * scale, scale);
  ctx.drawImage(img, 0, 0, meta.w, cut, -meta.ax, -meta.ay, meta.w, cut);
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = prev;
}

export const drawArmPieces = drawArmStrip;

const plugCache = new WeakMap<object, Record<number, CanvasImageSource | null>>();
const PLUG_CUT = 120;

/** Upper-sleeve-only cut of the master arm, used to plug the body-noarm shoulder hole. */
export function shoulderPlug(
  img: RigImageSource,
  g: ArmGeom,
  /** sleeve px kept below the pivot row (smaller while the arm is raised: only the shoulder cap stays) */
  cut: number = PLUG_CUT,
): CanvasImageSource | null {
  const store = plugCache.get(img as object) ?? {};
  plugCache.set(img as object, store);
  let cached = store[cut];
  if (cached !== undefined) return cached;
  try {
    const iw = (img as { width: number }).width;
    const ih = (img as { height: number }).height;
    const c0 =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(iw, ih)
        : Object.assign(document.createElement('canvas'), { width: iw, height: ih });
    const x0 = c0.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    x0.drawImage(img as CanvasImageSource, 0, 0);
    const src = x0.getImageData(0, 0, iw, ih);
    const sinT = Math.sin(g.theta);
    const cosT = Math.cos(g.theta);
    const ux = g.sgn * sinT;
    const uy = cosT;
    const sOf = (x: number, y: number) => (x - g.s0[0]) * ux + (y - g.s0[1]) * uy;
    const out = new Uint8ClampedArray(src.data);
    // Keep upper sleeve through near-elbow so the body-noarm void stays sealed when the
    // mesh rotates away. Soft feather over ~50px so it does not read as a second cuff.
    const feather = Math.min(50, cut * 0.45);
    for (let y = 0; y < ih; y++)
      for (let x = 0; x < iw; x++) {
        const k = (y * iw + x) * 4 + 3;
        if (!out[k]) continue;
        const t = (sOf(x, y) - (cut - feather)) / feather;
        const f = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
        out[k] = Math.round(out[k] * f);
      }
    const c =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(iw, ih)
        : Object.assign(document.createElement('canvas'), { width: iw, height: ih });
    (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(out, iw, ih), 0, 0);
    cached = c as unknown as CanvasImageSource;
  } catch {
    cached = null;
  }
  store[cut] = cached;
  return cached;
}

const sideFillCache = new WeakMap<object, Record<string, CanvasImageSource | null>>();

/**
 * Everything opaque on `body` but transparent on `body-noarm` on one side of the torso
 * (the full sleeve-free void). Drawn for the arm that is NOT posed so the rest arm never
 * leaves a see-through seam against the sleeve-free body. `side` 'l' = left half of the image.
 */
export function bodySideFill(
  body: RigImageSource,
  bodyNoarm: RigImageSource,
  side: 'l' | 'r',
  /** body-local shoulder; when set only the upper-arm void within `radius` is filled (posed arm) */
  shoulder?: readonly [number, number],
  radius = 240,
): CanvasImageSource | null {
  const key = body as object;
  const entry: Record<string, CanvasImageSource | null> = sideFillCache.get(key) ?? {};
  sideFillCache.set(key, entry);
  const ck = shoulder ? `${side}p${Math.round(radius)}` : side;
  if (entry[ck] !== undefined) return entry[ck] ?? null;
  let out: CanvasImageSource | null;
  try {
    const bw = (body as { width: number }).width;
    const bh = (body as { height: number }).height;
    const mk = (img: RigImageSource) => {
      const c =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(bw, bh)
          : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
      const x = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      x.clearRect(0, 0, bw, bh);
      x.drawImage(img as CanvasImageSource, 0, 0);
      return x.getImageData(0, 0, bw, bh);
    };
    const dBody = mk(body);
    const dNo = mk(bodyNoarm);
    const px = new Uint8ClampedArray(bw * bh * 4);
    const mid = bw / 2;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (side === 'l' ? x >= mid : x < mid) continue;
        const i = (y * bw + x) * 4;
        const a = dBody.data[i + 3];
        const cover = dNo.data[i + 3];
        if (a < 8 || cover >= 250) continue;
        px[i] = dBody.data[i];
        px[i + 1] = dBody.data[i + 1];
        px[i + 2] = dBody.data[i + 2];
        let f = 1;
        if (shoulder) {
          const dist = Math.hypot(x - shoulder[0], y - shoulder[1]);
          f = dist < radius - 40 ? 1 : Math.max(0, 1 - (dist - (radius - 40)) / 40);
        }
        px[i + 3] = Math.round(a * (1 - cover / 255) * f);
      }
    }
    const c =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(bw, bh)
        : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
    (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(px, bw, bh), 0, 0);
    out = c as unknown as CanvasImageSource;
  } catch {
    out = null;
  }
  entry[ck] = out;
  return out;
}

const bodyFillCache = new WeakMap<object, CanvasImageSource | null>();

/**
 * Pixels that are opaque on `body` but transparent on `body-noarm` near the shoulder —
 * the armpit notch the arm layer never covers. Cached per body image.
 */
export function bodyShoulderFill(
  body: RigImageSource,
  bodyNoarm: RigImageSource,
  bodyOff: readonly [number, number],
  shoulder: readonly [number, number],
  radius = 150,
): CanvasImageSource | null {
  const key = body as object;
  let cached = bodyFillCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const bw = (body as { width: number }).width;
    const bh = (body as { height: number }).height;
    const mk = (img: RigImageSource) => {
      const c =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(bw, bh)
          : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
      const x = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      x.clearRect(0, 0, bw, bh);
      x.drawImage(img as CanvasImageSource, 0, 0);
      return x.getImageData(0, 0, bw, bh);
    };
    const dBody = mk(body);
    const dNo = mk(bodyNoarm);
    const out = new Uint8ClampedArray(bw * bh * 4);
    // shoulder in body-local px
    const sx = shoulder[0] - bodyOff[0];
    const sy = shoulder[1] - bodyOff[1];
    const r2 = radius * radius;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = (y * bw + x) * 4;
        if (dBody.data[i + 3] < 20 || dNo.data[i + 3] > 10) continue;
        const dx = x - sx;
        const dy = y - sy;
        if (dx * dx + dy * dy > r2) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const f = dist < radius - 30 ? 1 : Math.max(0, 1 - (dist - (radius - 30)) / 30);
        out[i] = dBody.data[i];
        out[i + 1] = dBody.data[i + 1];
        out[i + 2] = dBody.data[i + 2];
        out[i + 3] = Math.round(dBody.data[i + 3] * f);
      }
    }
    const c =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(bw, bh)
        : Object.assign(document.createElement('canvas'), { width: bw, height: bh });
    (c.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(out, bw, bh), 0, 0);
    cached = c as unknown as CanvasImageSource;
  } catch {
    cached = null;
  }
  bodyFillCache.set(key, cached);
  return cached;
}

/** Placement of one sleeve piece cut from the master arm layer (see layers/arms/pieces.json). */
export interface ArmPieceInfo {
  file: string;
  offset: readonly [number, number];
  size: readonly [number, number];
  /** elbow sweep strip: sleeve-normal range [n0, n1] (px) and strip thickness along the spine */
  strip?: { n0: number; n1: number; thick: number; edgeLo?: number; edgeHi?: number };
}

export interface ArmPieces {
  joint: readonly [number, number];
  handJoint?: readonly [number, number];
  elbowS: number;
  handS: number;
  overlap: number;
  layerSize: readonly [number, number];
  upper: ArmPieceInfo;
  fore: ArmPieceInfo;
  elbow: ArmPieceInfo;
}

/** 2x3 affine [a b c d e f] as used by CanvasRenderingContext2D.setTransform */
export type Affine = [number, number, number, number, number, number];

export interface HingeFrames {
  /** posed shoulder spine point, elbow and hand attach (rig px) = the ArmChain / IK positions */
  shoulder: [number, number];
  elbow: [number, number];
  hand: [number, number];
  /** rest-pose points the pieces were cut around (rig px) */
  restShoulder: [number, number];
  restElbow: [number, number];
  restHand: [number, number];
  upper: Affine;
  fore: Affine;
  /** spine direction (rad) of the upper / fore as drawn, and the signed sweep between them */
  dirU: number;
  dirF: number;
  sweep: number;
}

/**
 * Affine that maps rest point A→A', B→B' as a rotation + a scale ALONG the rest axis only, so the
 * sleeve keeps its width while it is foreshortened (never a lateral squash).
 */
function axisAffine(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ax2: number,
  ay2: number,
  bx2: number,
  by2: number,
  axisAng: number,
): Affine {
  const d0x = bx - ax;
  const d0y = by - ay;
  const d1x = bx2 - ax2;
  const d1y = by2 - ay2;
  const rot = Math.atan2(d1y, d1x) - Math.atan2(d0y, d0x);
  const k = Math.hypot(d1x, d1y) / Math.max(1e-6, Math.hypot(d0x, d0y));
  // M = T(A') · R(rot) · Rax · diag(k,1) · Rax⁻¹ · T(−A)
  const ca = Math.cos(axisAng);
  const sa = Math.sin(axisAng);
  // S = Rax·diag(k,1)·Rax⁻¹
  const s11 = k * ca * ca + sa * sa;
  const s12 = (k - 1) * ca * sa;
  const s22 = k * sa * sa + ca * ca;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  // L = R(rot)·S
  const a = cr * s11 - sr * s12;
  const b = sr * s11 + cr * s12;
  const c = cr * s12 - sr * s22;
  const d = sr * s12 + cr * s22;
  return [a, b, c, d, ax2 - (a * ax + c * ay), ay2 - (b * ax + d * ay)];
}

/** Hinge geometry for one arm pose: every joint comes from the same ArmChain the IK solver uses. */
export function hingeFrames(
  g: ArmGeom,
  pivot: readonly [number, number],
  off: readonly [number, number],
  pieces: ArmPieces,
  p: ArmDrawParams,
  ch: ArmChain,
): HingeFrames {
  const bend = Math.max(-ARM_BEND_MAX_LOCAL, Math.min(ARM_BEND_MAX_LOCAL, p.e));
  ch.set(p.a, bend, p.w, p.z, p.lift, p.mergeMax ?? ARM_WRIST_MERGE_LOCAL);
  const axis = Math.atan2(ch.u0y, ch.u0x);
  const s0x = off[0] + g.s0[0];
  const s0y = off[1] + g.s0[1];
  const restS: [number, number] = [s0x + ch.u0x * ch.sp, s0y + ch.u0y * ch.sp];
  const restE: [number, number] = [off[0] + pieces.joint[0], off[1] + pieces.joint[1]];
  const restH: [number, number] = [
    off[0] + (pieces.handJoint?.[0] ?? pieces.joint[0] + ch.u0x * (ARM_HAND_S - ARM_ELBOW_S)),
    off[1] + (pieces.handJoint?.[1] ?? pieces.joint[1] + ch.u0y * (ARM_HAND_S - ARM_ELBOW_S)),
  ];
  const sh: [number, number] = [0, 0];
  const el: [number, number] = [0, 0];
  const ha: [number, number] = [0, 0];
  const tmp = [0, 0];
  ch.pos(ch.sp, tmp);
  sh[0] = tmp[0];
  sh[1] = tmp[1];
  ch.pos(ARM_ELBOW_S, tmp);
  el[0] = tmp[0];
  el[1] = tmp[1];
  ch.pos(ARM_HAND_S, tmp);
  ha[0] = tmp[0];
  ha[1] = tmp[1];
  const upper = axisAffine(restS[0], restS[1], restE[0], restE[1], sh[0], sh[1], el[0], el[1], axis);
  const fore = axisAffine(restE[0], restE[1], restH[0], restH[1], el[0], el[1], ha[0], ha[1], axis);
  const dirU = Math.atan2(el[1] - sh[1], el[0] - sh[0]);
  const dirF = Math.atan2(ha[1] - el[1], ha[0] - el[0]);
  // Screen-space angle balloons under foreshortening (z↑) and fans the strip into a hollow
  // white tube. Always drive the hinge strip from the JOINT bend.
  const screenSweep = Math.atan2(Math.sin(dirF - dirU), Math.cos(dirF - dirU));
  const jointSweep = ch.sgnRot * bend;
  const sweep = jointSweep;
  void screenSweep;
  return {
    shoulder: sh,
    elbow: el,
    hand: ha,
    restShoulder: restS,
    restElbow: restE,
    restHand: restH,
    upper,
    fore,
    dirU,
    dirF,
    sweep,
  };
}

/**
 * Draw the arm as two rigid sleeve pieces (upper + forearm) joined by a MITRE: both pieces run past
 * the elbow plane and are clipped to the two halves of the bend bisector. They meet exactly — sharp
 * outer corner (the jacket hinge), closed inner crook, the official sleeve outline running unbroken
 * around the corner — with fully opaque hard edges (no feathered overlap, no swept strip, no wedge).
 * Joints, lengths and the hand attach are the ArmChain / IK values (hingeFrames), so the wrist lands
 * exactly on the solved target.
 */
export function drawArmHinge(
  ctx: Ctx,
  g: ArmGeom,
  pivot: readonly [number, number],
  off: readonly [number, number],
  pieces: ArmPieces,
  upperImg: RigImageSource,
  foreImg: RigImageSource,
  _elbowImg: RigImageSource,
  p: ArmDrawParams,
): void {
  const ch = chainFor(upperImg as object, g, pivot, off);
  const f = hingeFrames(g, pivot, off, pieces, p, ch);

  const put = (img: RigImageSource, m: Affine, info: ArmPieceInfo) => {
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(img as CanvasImageSource, off[0] + info.offset[0], off[1] + info.offset[1]);
    ctx.restore();
  };

  // mitre plane through the elbow, normal = mean of the two segment directions
  let nx = Math.cos(f.dirU) + Math.cos(f.dirF);
  let ny = Math.sin(f.dirU) + Math.sin(f.dirF);
  const nl = Math.hypot(nx, ny);
  if (nl < 1e-3) {
    nx = Math.cos(f.dirU);
    ny = Math.sin(f.dirU);
  } else {
    nx /= nl;
    ny /= nl;
  }
  const cx = f.elbow[0] + nx * MITRE_SHIFT;
  const cy = f.elbow[1] + ny * MITRE_SHIFT;
  const L = 1600;
  const tx = -ny;
  const ty = nx;
  /** clip to the half plane `side * (p - c)·n ≥ -grow` */
  const clipHalf = (side: 1 | -1, grow: number) => {
    const ox = cx - side * nx * grow;
    const oy = cy - side * ny * grow;
    ctx.beginPath();
    ctx.moveTo(ox - tx * L, oy - ty * L);
    ctx.lineTo(ox + tx * L, oy + ty * L);
    ctx.lineTo(ox + tx * L + side * nx * L, oy + ty * L + side * ny * L);
    ctx.lineTo(ox - tx * L + side * nx * L, oy - ty * L + side * ny * L);
    ctx.closePath();
    ctx.clip();
  };

  // round outer corner: each rigid piece is cut flat at its own elbow perpendicular, and a disc of
  // sleeve-half-width radius around the elbow rounds the OUTER corner (a hard jacket hinge, never
  // the long spike a deep mitre would make). The mitre plane splits the disc between the pieces.
  const uU: [number, number] = [Math.cos(f.dirU), Math.sin(f.dirU)];
  const uF: [number, number] = [Math.cos(f.dirF), Math.sin(f.dirF)];
  const turn = Math.atan2(Math.sin(f.dirF - f.dirU), Math.cos(f.dirF - f.dirU));
  const sg = turn >= 0 ? 1 : -1;
  const strip = pieces.elbow.strip;
  const eLo = strip?.edgeLo ?? -40;
  const eHi = strip?.edgeHi ?? 40;
  // piece sleeve-normal → screen: |A·w| and which side of the axis is the outer side of the fold
  const wv: [number, number] = [
    f.upper[0] * ch.w0x + f.upper[2] * ch.w0y,
    f.upper[1] * ch.w0x + f.upper[3] * ch.w0y,
  ];
  const wl = Math.hypot(wv[0], wv[1]) || 1;
  const outerAng = f.dirU - (sg * Math.PI) / 2;
  const outerPlus = Math.cos(outerAng) * wv[0] + Math.sin(outerAng) * wv[1] > 0;
  const R = (outerPlus ? eHi : -eLo) * wl - 1.8;
  const half = (px: number, py: number, dx: number, dy: number, grow: number) => {
    // region (p - elbow)·d ≥ -grow
    const ox = f.elbow[0] - dx * grow;
    const oy = f.elbow[1] - dy * grow;
    const ex = -dy;
    const ey = dx;
    ctx.beginPath();
    ctx.moveTo(ox - ex * L, oy - ey * L);
    ctx.lineTo(ox + ex * L, oy + ey * L);
    ctx.lineTo(ox + ex * L + dx * L, oy + ey * L + dy * L);
    ctx.lineTo(ox - ex * L + dx * L, oy - ey * L + dy * L);
    ctx.closePath();
    void px;
    void py;
  };
  const disc = () => {
    ctx.beginPath();
    ctx.arc(f.elbow[0], f.elbow[1], R, 0, Math.PI * 2);
  };
  const pass = (img: RigImageSource, m: Affine, info: ArmPieceInfo, side: 1 | -1, grow: number) => {
    const d: [number, number] = side > 0 ? uF : [-uU[0], -uU[1]];
    for (const shape of ['flat', 'disc'] as const) {
      ctx.save();
      clipHalf(side, grow);
      if (shape === 'flat') half(0, 0, d[0], d[1], 0.8);
      else disc();
      ctx.clip();
      put(img, m, info);
      ctx.restore();
    }
  };
  pass(foreImg, f.fore, pieces.fore, 1, 1.2);
  pass(upperImg, f.upper, pieces.upper, -1, 0);

  // outline of the rounded outer corner, in the sleeve's own line colour
  ctx.save();
  ctx.strokeStyle = 'rgba(112, 82, 72, 0.9)';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const a0 = f.dirU - (sg * Math.PI) / 2;
  ctx.arc(f.elbow[0], f.elbow[1], R - 0.9, a0, a0 + turn, sg < 0);
  ctx.stroke();
  // the line continues a few px along each straight sleeve edge and fades out (no abrupt start/end)
  const tail = (ang: number, dx: number, dy: number) => {
    const sx = f.elbow[0] + Math.cos(ang) * (R - 0.9);
    const sy = f.elbow[1] + Math.sin(ang) * (R - 0.9);
    const gr = ctx.createLinearGradient(sx, sy, sx + dx * 16, sy + dy * 16);
    gr.addColorStop(0, 'rgba(112, 82, 72, 0.9)');
    gr.addColorStop(1, 'rgba(112, 82, 72, 0)');
    ctx.strokeStyle = gr;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dx * 16, sy + dy * 16);
    ctx.stroke();
  };
  tail(a0, -uU[0], -uU[1]);
  tail(a0 + turn, uF[0], uF[1]);
  ctx.restore();

  ch.hand(armFrame);
}
