#!/usr/bin/env python3
"""Cut the extra Nomi rig parts (pixel cuts only — nothing is redrawn or generated).

Usage:
  python3 scripts/brand/build-nomi-parts.py <nomi-head-front-hd.jpg> <layers-dir> [stage ...]

Stages (default: all, in order)
  hair-tails   lower side locks of the HD head art as two standalone parts that sway behind the
               head (single owner of the collar-side tips; the old low-res body tips and the
               `hair-side-*` wisps that duplicated head pixels are retired).

Every part is cut at the NATIVE resolution of the owner's art and drawn at the head scale (0.66),
exactly like head.png (same source -> rig mapping, see build-nomi-head-hd.py).
"""
import sys
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

SRC = sys.argv[1]
LAY = Path(sys.argv[2])
STAGES = sys.argv[3:] or ["hair-tails"]
K = 0.66
SRC_CHIN = (640.0, 470.0)
RIG_CHIN = (474.0, 381.0)


def to_rig(x, y):
    return (RIG_CHIN[0] + (x - SRC_CHIN[0]) * K, RIG_CHIN[1] + (y - SRC_CHIN[1]) * K)


def save_part(name, rgb, alpha, x0, y0):
    """Crop to the alpha bbox and save RGBA; returns the rig offset [x, y, scale]."""
    ys, xs = np.nonzero(alpha > 0.004)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    a8 = np.clip(alpha[by0:by1, bx0:bx1] * 255 + 0.5, 0, 255).astype(np.uint8)
    c8 = np.clip(rgb[by0:by1, bx0:bx1] + 0.5, 0, 255).astype(np.uint8)
    c8[a8 == 0] = 0
    Image.fromarray(np.dstack([c8, a8]), "RGBA").save(LAY / f"{name}.png", optimize=True)
    rx, ry = to_rig(x0 + bx0, y0 + by0)
    return [round(rx, 2), round(ry, 2), K]


# ---- matte of the HD head art: white background, colour-unmixed soft alpha ----------------------
def matte(img):
    H, W = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    d = (255 - img).max(2)
    low = (d < 14).astype(np.uint8)
    _, lab = cv2.connectedComponents(low)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # enclosed white pockets between curls (not the neck / collar)
    pock = (d < 24) & (yy < 520) & ~((xx > 560) & (xx < 720) & (yy > 300))
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(pock.astype(np.uint8))
    for i in range(1, n2):
        if st2[i, 4] >= 3:
            bg |= lab2 == i
    bgc = np.median(img[bg], axis=0)
    solid = (~cv2.dilate(bg.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)).astype(np.float32)

    def nblur(x, m, s):
        return cv2.GaussianBlur(x * m[..., None], (0, 0), s) / np.maximum(cv2.GaussianBlur(m, (0, 0), s), 1e-4)[..., None]

    f = nblur(img, solid, 3.0)
    f2 = nblur(img, solid, 8.0)
    wf = cv2.GaussianBlur(solid, (0, 0), 3.0)[..., None]
    f = np.where(wf > 0.02, f, f2)
    v = f - bgc
    a_un = np.clip(((img - bgc) * v).sum(2) / np.maximum((v * v).sum(2), 60.0), 0, 1)
    band = cv2.dilate(bg.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~bg
    alpha = np.where(bg, 0, np.where(band, a_un, 1.0)).astype(np.float32)
    rgb = np.where((alpha < 0.98)[..., None], f, img)
    return rgb, alpha


def poly_y(pts, x):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return np.interp(x, xs, ys)


# white edge of the jacket collar in the HD art (hair tips lie over / above it)
COLLAR_L = [(300, 570), (397, 543), (563, 454), (600, 444)]
COLLAR_R = [(680, 444), (705, 452), (767, 475), (807, 497), (868, 545), (960, 610)]


def stage_hair_tails():
    img = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
    H, W = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    rgb, alpha = matte(img)
    hsv = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    out = {}
    for side, (rx0, rx1), collar in [("l", (318, 568), COLLAR_L), ("r", (712, 944), COLLAR_R)]:
        region = (xx >= rx0) & (xx < rx1) & (yy >= 378) & (yy < 512)
        cy = poly_y(collar, xx)
        below = yy > cy - 2
        above = yy < cy - 1
        dark = ((lum < 122) | (above & (lum < 150) & (hsv[..., 1] < 140))) & (alpha > 0.12)
        orange = (hsv[..., 0] >= 6) & (hsv[..., 0] <= 26) & (hsv[..., 1] > 140) & (lum > 95) & (alpha > 0.12) & (yy < cy - 6)
        t0 = (dark | orange) & region
        # thin collar outline lines below the edge go; thick hair over the collar stays
        keep_below = cv2.morphologyEx((t0 & below).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=2).astype(bool)
        # the jacket collar itself (inner part, next to the neck) is never hair
        inner_collar = below & ((xx > 505) if side == "l" else (xx < 775))
        t = (t0 & ~below) | (keep_below & ~inner_collar)
        t = cv2.morphologyEx(t.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(t, connectivity=8)
        keep = np.zeros_like(t)
        for i in range(1, n):
            ys_ = np.nonzero(lab == i)[0]
            if st[i, 4] >= 160 or (st[i, 1] < 392 and st[i, 4] >= 25):
                keep[lab == i] = 1
        a = alpha * keep
        # specks of pale background glow inside the strands
        a = np.where((lum > 195) & (a < 0.9), 0, a)
        out[side] = (rgb, a)
        off = save_part(f"hair-tail-{side}", rgb, a, 0, 0)
        print(f"hair-tail-{side}", off)
    return out


for s in STAGES:
    {"hair-tails": stage_hair_tails}[s]()
