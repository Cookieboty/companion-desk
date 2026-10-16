#!/usr/bin/env python3
"""Cut the official sleeve layers into upper-arm, forearm and elbow-cap pieces.

Cuts are in the ORIGINAL orientation of the master layer so upper + forearm (ignoring the
feathered overlap) composite back to the master pixel-for-pixel. Every pixel comes from the
official art (brand lock: pixel-cut only, no repaint).

  python3 scripts/brand/build-nomi-arm-pieces.py [--check]

Outputs under packages/renderer/public/assets/models/sprite/nomi/layers/arms/:
  arm-{r,l}-upper.png   shoulder → elbow + OVERLAP (feathered distal edge)
  arm-{r,l}-fore.png    elbow − OVERLAP → cuff (feathered proximal edge)
  arm-{r,l}-elbow.png   1-D sleeve cross-section at the elbow (swept through the bend angle at draw time)
  pieces.json           offsets, elbow joint, overlap, sizes
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'packages/renderer/public/assets/models/sprite/nomi'
# Keep in sync with packages/renderer/src/mascot/rig/armKin.ts
ELBOW_S = 340
HAND_S = 560
OVERLAP = 125  # px each piece extends past the elbow plane so the renderer can MITRE them (hard cut at draw time)


def feather(alpha: np.ndarray, dist: np.ndarray, lo: float, hi: float, into: str) -> np.ndarray:
    """Multiply alpha by a smooth ramp between lo..hi along `dist`. into='hi' fades toward hi."""
    t = np.clip((dist - lo) / max(1e-6, hi - lo), 0, 1)
    t = t * t * (3 - 2 * t)
    if into == 'hi':
        return (alpha * (1 - t)).astype(np.uint8)
    return (alpha * t).astype(np.uint8)

ELBOW_EDGES: list = [0.0, 0.0, 0.0]
CUFF_W = 102.0  # rendered cuff width (rig px) the forearm tapers to: matches sleeveEndWidth() in meshArm.ts


def smooth(x: np.ndarray, k: int) -> np.ndarray:
    pad = np.pad(x, (k, k), mode='edge')
    return np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode='same')[k:-k]


def taper_forearm(a: np.ndarray, geom: dict, ux, uy, wx, wy, s_start=None, flare=True) -> np.ndarray:
    """Resample the sleeve across its width so the forearm keeps ~the upper-arm width at the elbow
    and ends at the cuff width (the master art flares into a wide bell). Pure resample of the
    official pixels along the sleeve normal, no repaint."""
    h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    s = (xs + 0.5 - geom['s0'][0]) * ux + (ys + 0.5 - geom['s0'][1]) * uy
    n = (xs + 0.5 - geom['s0'][0]) * wx + (ys + 0.5 - geom['s0'][1]) * wy
    S = np.arange(0, int(HAND_S) + 40)
    lo = np.full(len(S), np.nan)
    hi = np.full(len(S), np.nan)
    alpha = a[..., 3]
    for i, sv in enumerate(S):
        k = (np.abs(s - sv) < 1.5) & (alpha > 100)
        if k.any():
            lo[i], hi[i] = n[k].min(), n[k].max()
    idx = np.arange(len(S))
    ok = ~np.isnan(lo)
    lo = np.interp(idx, idx[ok], lo[ok])
    hi = np.interp(idx, idx[ok], hi[ok])
    lo, hi = smooth(lo, 12), smooth(hi, 12)
    centre, width = (lo + hi) / 2, hi - lo
    w_el = width[ELBOW_S]
    ELBOW_EDGES[:] = [float(lo[ELBOW_S]), float(hi[ELBOW_S]), float(centre[ELBOW_S])]
    def ramp(sv):
        t_ = np.clip((sv - ELBOW_S) / (HAND_S - ELBOW_S), 0, 1)
        return t_ * t_ * (3 - 2 * t_)
    si = np.clip(s, 0, len(S) - 1)
    c_s = np.interp(si, S, centre)
    w_src = np.interp(si, S, width)
    s_start = ELBOW_S - OVERLAP if s_start is None else s_start
    w_tgt = w_el + (CUFF_W - w_el) * ramp(s) if flare else np.full_like(s, w_el)
    ratio = np.where(s > s_start, w_src / np.maximum(w_tgt, 1.0), 1.0)
    n_src = c_s + (n - c_s) * ratio
    # source pixel for each destination pixel
    sx = geom['s0'][0] + ux * s + wx * n_src - 0.5
    sy = geom['s0'][1] + uy * s + wy * n_src - 0.5
    pm = a.astype(np.float64)
    pm[..., :3] *= pm[..., 3:4] / 255.0
    x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int)
    fx = (sx - x0)[..., None]; fy = (sy - y0)[..., None]
    def g(yy, xx):
        yc = np.clip(yy, 0, h - 1); xc = np.clip(xx, 0, w - 1)
        v = pm[yc, xc]
        inside = ((yy >= 0) & (yy < h) & (xx >= 0) & (xx < w))[..., None]
        return v * inside
    v = (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
         + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)
    al = v[..., 3:4]
    rgb = np.where(al > 0.5, v[..., :3] / np.maximum(al, 1e-6) * 255.0, 0)
    out = np.concatenate([rgb, al], axis=2)
    out = np.clip(out + 0.5, 0, 255).astype(np.uint8)
    # unchanged rows (proximal of the taper) stay byte-identical to the master
    same = (s <= s_start)[..., None]
    out = np.where(same, a, out)
    return out


def mirror_back(f: np.ndarray, s: np.ndarray, ux: float, uy: float) -> np.ndarray:
    """The forearm's back extension (s < ELBOW_S, only ever seen as the OUTER mitre corner) must be plain
    sleeve fabric, never the strap/hardware that sits just above the elbow in the master. Mirror the
    fabric just below the elbow across the elbow plane (same pixels, flipped along the sleeve axis)."""
    h, w = f.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    d = 2.0 * (ELBOW_S - s)
    sx = xs + ux * d
    sy = ys + uy * d
    x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int)
    fx = (sx - x0)[..., None]; fy = (sy - y0)[..., None]
    pm = f.astype(np.float64); pm[..., :3] *= pm[..., 3:4] / 255.0
    def g(yy, xx):
        ok = ((yy >= 0) & (yy < h) & (xx >= 0) & (xx < w))[..., None]
        return pm[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)] * ok
    v = (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
         + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)
    al = v[..., 3:4]
    rgb = np.where(al > 0.5, v[..., :3] / np.maximum(al, 1e-6) * 255.0, 0)
    m = np.clip(np.concatenate([rgb, al], axis=2) + 0.5, 0, 255).astype(np.uint8)
    back = ((s < ELBOW_S) & (s > ELBOW_S - OVERLAP))[..., None]
    return np.where(back, m, f)


def cut(side: str, geom: dict):
    src = Image.open(MODEL / f'layers/arm-{side}.png').convert('RGBA')
    a = np.array(src)
    h, w = a.shape[:2]
    th, sgn = geom['theta'], geom['sgn']
    ux, uy = sgn * math.sin(th), math.cos(th)
    # lateral (outer = + for r when we want the side away from body for a hanging arm:
    # w0 = (cosθ, -sgn·sinθ); body is toward -sgn in x, so outer is +n for sgn=+1? 
    # For hanging arm, body is inward (-sgn in screen x). Outer elbow for positive bend
    # (forearm swings outward) is the +n side for sgn=+1.)
    wx, wy = math.cos(th), -sgn * math.sin(th)
    ys, xs = np.mgrid[0:h, 0:w]
    s = (xs + 0.5 - geom['s0'][0]) * ux + (ys + 0.5 - geom['s0'][1]) * uy
    n = (xs + 0.5 - geom['s0'][0]) * wx + (ys + 0.5 - geom['s0'][1]) * wy
    out = {}

    # --- upper / fore: rigid sleeve pieces that each run PAST the elbow plane (OVERLAP px). The renderer
    # miters them (clip both to the bend bisector) so the joint is two opaque, hard-edged pieces that
    # meet exactly: sharp outer corner, closed inner crook, continuous outline, no feathered alpha.
    # Both are width-normalised to the elbow width around the joint so the mitre corners coincide.
    upper = taper_forearm(a, geom, ux, uy, wx, wy, s_start=ELBOW_S, flare=False)
    upper[s >= ELBOW_S + OVERLAP] = 0
    fore = taper_forearm(a, geom, ux, uy, wx, wy, s_start=ELBOW_S - OVERLAP)
    fore = mirror_back(fore, s, ux, uy)
    keep = (s > ELBOW_S - OVERLAP) & (s < HAND_S + 6)
    fore[~keep] = 0
    # --- elbow sweep strip: the sleeve cross-section at the elbow (official pixels, averaged over a
    # few px of s). The renderer sweeps it through the bend angle about the elbow, so the OUTER corner
    # is a clean round hinge in the sleeve's own outline colour, and the inner crook is solid.
    THICK = 6
    n_lo = int(math.floor(geom['nmin'])) - 6
    n_hi = int(math.ceil(geom['nmax'])) + 6
    nn = np.arange(n_lo, n_hi + 1, dtype=np.float64)
    pm = a.astype(np.float64)
    pm[..., :3] *= pm[..., 3:4] / 255.0
    acc = np.zeros((len(nn), 4))
    cnt = 0
    for sv in np.linspace(ELBOW_S - 2.5, ELBOW_S + 2.5, 6):
        px = geom['s0'][0] + ux * sv + wx * nn - 0.5
        py = geom['s0'][1] + uy * sv + wy * nn - 0.5
        x0 = np.floor(px).astype(int); y0 = np.floor(py).astype(int)
        fx = (px - x0)[:, None]; fy = (py - y0)[:, None]
        def g(yy, xx):
            ok = ((yy >= 0) & (yy < h) & (xx >= 0) & (xx < w))[:, None]
            return pm[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)] * ok
        acc += (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
                + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)
        cnt += 1
    acc /= cnt
    al = acc[:, 3:4]
    rgb = np.where(al > 0.5, acc[:, :3] / np.maximum(al, 1e-6) * 255.0, 0)
    row = np.clip(np.concatenate([rgb, al], axis=1) + 0.5, 0, 255).astype(np.uint8)
    strip_img = np.repeat(row[None, :, :], THICK, axis=0)
    strip_meta = {'n0': n_lo, 'n1': n_hi, 'thick': THICK,
                  'edgeLo': round(ELBOW_EDGES[0], 2), 'edgeHi': round(ELBOW_EDGES[1], 2)}

    for name, piece in (('upper', upper), ('fore', fore)):
        alpha = piece[..., 3]
        yy, xx = np.where(alpha > 0)
        if len(xx) == 0:
            raise SystemExit(f'{side}.{name}: empty cut')
        x0, x1, y0, y1 = int(xx.min()), int(xx.max()) + 1, int(yy.min()), int(yy.max()) + 1
        out[name] = (Image.fromarray(piece[y0:y1, x0:x1]), [x0, y0])

    out['elbow'] = (Image.fromarray(strip_img), [0, 0])

    ex = geom['s0'][0] + ux * ELBOW_S
    ey = geom['s0'][1] + uy * ELBOW_S
    hx = geom['s0'][0] + ux * HAND_S
    hy = geom['s0'][1] + uy * HAND_S
    return out, [round(ex, 2), round(ey, 2)], [round(hx, 2), round(hy, 2)], (w, h), strip_meta


def main():
    check = '--check' in sys.argv
    arms = json.loads((MODEL / 'manifest.json').read_text())['rig']['arms']
    meta = {}
    (MODEL / 'layers/arms').mkdir(exist_ok=True)
    for side, geom in arms.items():
        pieces, elbow, hand, size, strip_meta = cut(side, geom)
        entry = {
            'joint': elbow,
            'handJoint': hand,
            'elbowS': ELBOW_S,
            'handS': HAND_S,
            'overlap': OVERLAP,
            'layerSize': list(size),
            'pieces': {},
        }
        for name, (im, off) in pieces.items():
            f = MODEL / f'layers/arms/arm-{side}-{name}.png'
            info = {
                'file': f'layers/arms/arm-{side}-{name}.png',
                'offset': off,
                'size': list(im.size),
            }
            if name == 'elbow':
                info['strip'] = strip_meta
            entry['pieces'][name] = info
            entry[name] = info
            if check:
                if not f.exists() or np.any(np.array(Image.open(f).convert('RGBA')) != np.array(im)):
                    print(f'{f} is stale', file=sys.stderr)
                    sys.exit(1)
            else:
                im.save(f, optimize=True)
        meta[side] = entry
    if not check:
        (MODEL / 'layers/arms/pieces.json').write_text(json.dumps(meta, indent=2) + '\n')
    print('arm pieces ok' if check else 'wrote layers/arms/*.png (upper/fore/elbow)')


if __name__ == '__main__':
    main()
