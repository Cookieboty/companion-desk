#!/usr/bin/env python3
"""Torso side panels ("flank") for the raised-arm poses.

body-noarm.png is body.png with both sleeves cut out; the cut is a straight, un-outlined
edge. With an arm lifted that edge is the visible torso silhouette, so it read as a flat
cut (or let the backdrop bleed through). The official art has no pixels for the jacket
side that sits under the sleeve, so this script derives it:

  * the fabric colour of every row is the median of the official body-noarm pixels just
    inside the cut edge (no new palette, no generative model - local resampling only);
  * it is extended outward by a few px with a gentle form-shadow towards the turn;
  * the new silhouette gets the sleeve's own ink outline; the panel tapers to nothing at
    the armpit and at the hem so it joins the cut edge without a visible seam.

Outputs layers/body-flank-{l,r}.png (derived, marked generated in LICENSE.txt).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
import cv2

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'packages/renderer/public/assets/models/sprite/nomi'
OUT_SS = 4
INK = np.array([112, 82, 72], float)  # same ink as the sleeve outline
WF = 28.0  # panel width (px) over the mid flank
Y_TOP = 205  # panel starts (tapered) at this body row
Y_END = 700
INK_W = 2.8


def gauss1d(v, sigma, axis=0):
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = [(0, 0)] * v.ndim
    pad[axis] = (r, r)
    vp = np.pad(v, pad, mode='edge')
    return np.apply_along_axis(lambda m: np.convolve(m, k, mode='valid'), axis, vp)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def build(side, noarm):
    """noarm: HxWx4 uint8. returns (rgba uint8 cropped, (x0, y0))."""
    a = noarm.copy()
    if side == 'l':
        a = a[:, ::-1]
    H, W = a.shape[:2]
    alpha = a[:, :, 3] / 255.0
    cut = np.full(H, np.nan)
    for y in range(Y_TOP - 20, Y_END + 20):
        xs = np.where(alpha[y, W // 2:] > 0.5)[0]
        if len(xs):
            cut[y] = W // 2 + xs.max()
    ys = np.arange(H)
    good = ~np.isnan(cut)
    cut = np.interp(ys, ys[good], cut[good])
    cut = gauss1d(cut, 4)
    # fabric colour per row from the official pixels just inside the edge
    col = np.zeros((H, 3))
    for y in range(H):
        c = int(round(cut[y]))
        seg = a[y, max(0, c - 16):max(1, c - 5), :3].astype(float)
        sa = alpha[y, max(0, c - 16):max(1, c - 5)]
        seg = seg[(sa > 0.9) & (seg.min(axis=1) > 150)]
        col[y] = np.median(seg, axis=0) if len(seg) else (250, 240, 232)
    col = gauss1d(col, 9, axis=0)
    # panel half-profile: taper in at the armpit, out at the hem
    yy = ys.astype(float)
    w = WF * smoothstep(Y_TOP, Y_TOP + 70, yy) * (1 - smoothstep(Y_END - 70, Y_END, yy))
    # supersampled render of the panel
    S = OUT_SS
    X0 = int(cut[Y_TOP:Y_END].min()) - 6
    X1 = int(cut[Y_TOP:Y_END].max() + WF) + 8
    Y0, Y1 = Y_TOP - 4, Y_END + 4
    gx = (np.arange((X1 - X0) * S) + 0.5) / S + X0
    gy = (np.arange((Y1 - Y0) * S) + 0.5) / S + Y0
    GX, GY = np.meshgrid(gx, gy)
    yi = np.clip(GY.astype(int), 0, H - 1)
    cutg = np.interp(GY, ys, cut)
    wg = np.interp(GY, ys, w)
    dx = GX - cutg
    inside = (dx > -3) & (dx < wg)
    # union with the existing torso, for the outline ring
    ax = np.zeros_like(GX)
    ayi = np.clip(GY.astype(int), 0, H - 1)
    axi = np.clip(GX.astype(int), 0, W - 1)
    ax = alpha[ayi, axi]
    union = inside | (ax > 0.5)
    dist = cv2.distanceTransform(union.astype(np.uint8), cv2.DIST_L2, 5) / S
    ring = union & (dist < INK_W) & inside & (dx > 1)
    t = np.clip(dx / np.maximum(wg, 1e-3), 0, 1)
    rgb = np.zeros(GX.shape + (3,))
    base = np.stack([np.interp(GY, ys, col[:, k]) for k in range(3)], -1)
    shade = (1 - 0.05 * t ** 2 - 0.035 * smoothstep(0.55, 1.0, t))[..., None] * np.array([1, 0.985, 0.975])
    rgb = base * shade
    # ink: opaque at the very edge, fading inward
    k = np.clip((INK_W - dist) / 1.2, 0, 1)[..., None]
    k = k * ring[..., None]
    rgb = rgb * (1 - k) + INK * k
    alpha_ss = inside.astype(float)
    # box-downsample
    h, wd = (Y1 - Y0), (X1 - X0)
    def ds(v):
        return v.reshape(h, S, wd, S, *v.shape[2:]).mean(axis=(1, 3))
    A = ds(alpha_ss)
    RGB = ds(rgb * alpha_ss[..., None]) / np.maximum(A[..., None], 1e-4)
    img = np.dstack([np.clip(RGB, 0, 255), A * 255]).astype(np.uint8)
    if side == 'l':
        img = img[:, ::-1]
        X0 = W - X1
    return img, (X0, Y0)


def main():
    noarm = np.array(Image.open(MODEL / 'layers/body-noarm.png').convert('RGBA'))
    body_off = json.loads((MODEL / 'manifest.json').read_text())['rig']['layers']['body-noarm'][:2]
    out = {}
    for side in ('l', 'r'):
        img, (x0, y0) = build(side, noarm)
        Image.fromarray(img, 'RGBA').save(MODEL / f'layers/body-flank-{side}.png', optimize=True)
        out[side] = [x0 + body_off[0], y0 + body_off[1]]
        print(side, img.shape, out[side])
    print(json.dumps(out))


if __name__ == '__main__':
    sys.exit(main())
