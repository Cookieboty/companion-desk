#!/usr/bin/env python3
"""Re-cut collar hair tips from the official half-body — hard silhouette, no ghost fringe.

Soft white-keys of the JPG left semi-transparent duplicate curls beside the neck (double
fringe). This script:

1. Clears the tip band on body / body-noarm, then pastes HARD-keyed official pixels
   (bilateral-denoised JPG, strict hair/orange/dark mask, morphology cleanup, connected
   components that touch the hair above, official-bg scrub, pale-fringe recolor).
   Tip-band alpha is 0 or 255.
2. Punches head tip fringe outside the neck column so body alone owns the collar tips
   (neck skin column untouched).
3. Hard-cuts hair-side bottoms above the tip band so they cannot double-draw.

Usage: python3 scripts/brand/fix-nomi-hair-collar.py <official half-body jpg> <layers dir>
"""
import sys
import json
import numpy as np
import cv2
from PIL import Image
from pathlib import Path

REF, LAY = sys.argv[1], Path(sys.argv[2])
BO = (66, 291)
Y0, Y1 = 328, 428
ZONES = [(255, 425), (530, 700)]
m = json.loads((LAY.parent / "manifest.json").read_text())

ref = cv2.bilateralFilter(
    np.array(Image.open(REF).convert("RGB").crop((400, 0, 880, 560)).resize((960, 1120), Image.LANCZOS)),
    d=5, sigmaColor=25, sigmaSpace=5,
).astype(np.float32)


def smooth(x, a, b):
    t = np.clip((x - a) / max(1e-6, b - a), 0, 1)
    return t * t * (3 - 2 * t)


def hard_key(rgb):
    white = rgb.min(2)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = rgb.mean(2)
    is_hair = (white < 210) & (lum < 175) & (sat > 0.10) & (rgb[:, :, 0] + 15 > rgb[:, :, 2])
    is_orange = (rgb[:, :, 0] > 140) & (rgb[:, :, 0] > rgb[:, :, 2] + 35) & (sat > 0.22) & (lum < 210)
    is_dark = (lum < 55) & (white < 80)
    content = (is_hair | is_orange | is_dark).astype(np.uint8)
    content = cv2.morphologyEx(content, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    content = cv2.morphologyEx(content, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return rgb, content.astype(np.float32)


def patch_body(name):
    im = np.array(Image.open(LAY / name).convert("RGBA")).astype(np.float32)
    h, w = im.shape[:2]
    full = np.zeros((1120, 960, 4), np.float32)
    full[BO[1] : BO[1] + h, BO[0] : BO[0] + w] = im
    out = full.copy()
    for x0, x1 in ZONES:
        sl = (slice(Y0, Y1), slice(x0, x1))
        e, a = hard_key(ref[sl])
        a = np.where(ref[sl].min(2) > 238, 0, a)
        yy = np.arange(Y0, Y1)[:, None]
        tipb = np.broadcast_to(yy < 410, a.shape)
        cleared = out[sl].copy()
        cleared[..., 3] = np.where(tipb, 0, cleared[..., 3])
        cleared[..., :3] = np.where(tipb[..., None], 0, cleared[..., :3])
        bin_ = (a > 0.5).astype(np.uint8)
        nlab, lab, stats, _ = cv2.connectedComponentsWithStats(bin_, 8)
        keep = np.zeros_like(bin_)
        for i in range(1, nlab):
            touches_top = (lab[0] == i).any()
            area = stats[i, cv2.CC_STAT_AREA]
            if (touches_top and area >= 30) or area >= 1200:
                keep[lab == i] = 1
        a = a * keep
        top_m = smooth(yy, Y0, Y0 + 6)
        use = a > 0.5
        lum = e.mean(2)
        pale = use & (lum > 150)
        mean_c = e[use & (lum < 140)].mean(0) if (use & (lum < 140)).any() else np.array([55.0, 38, 28])
        e = e.copy()
        e[pale] = mean_c
        dst = cleared
        for c in range(3):
            dst[..., c] = np.where(use, e[..., c], dst[..., c])
        alpha = np.where(use, 255.0, 0.0)
        feather = use & np.broadcast_to(yy < Y0 + 6, a.shape)
        alpha = np.where(feather, 255.0 * np.broadcast_to(top_m, a.shape), alpha)
        alpha = np.where(use | tipb, alpha, dst[..., 3])
        dst[..., 3] = alpha
        old = full[sl]
        keep_old = (~tipb) & (~use) & (old[..., 3] > 200)
        dst[keep_old] = old[keep_old]
        out[sl] = dst
    sub = np.clip(out[BO[1] : BO[1] + h, BO[0] : BO[0] + w] + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(sub, "RGBA").save(LAY / name, optimize=True)
    print("patched", name)


patch_body("body.png")
patch_body("body-noarm.png")

ox, oy, sc = m["rig"]["layers"]["head"]
head = np.array(Image.open(LAY / "head.png").convert("RGBA")).astype(np.float32)
hh, ww = head.shape[:2]
ys = (oy + np.arange(hh) * sc)[:, None]
xs = (ox + np.arange(ww) * sc)[None, :]
outside = np.abs(xs - 480) > 58
kill = outside.astype(np.float32) * smooth(ys, 345, 355)
kill = np.maximum(kill, outside.astype(np.float32) * (ys > 358).astype(np.float32))
head[..., 3] *= 1 - np.clip(kill, 0, 1)
head[..., 3] = np.where(outside & (ys > 360), 0, head[..., 3])
Image.fromarray(np.clip(head, 0, 255).astype(np.uint8), "RGBA").save(LAY / "head.png", optimize=True)
print("punched head tip fringe outside neck")

for n in ["hair-side-l", "hair-side-r"]:
    ox_, oy_, sc_ = m["rig"]["layers"][n]
    im = np.array(Image.open(LAY / f"{n}.png").convert("RGBA")).astype(np.float32)
    h, w = im.shape[:2]
    ys = (oy_ + np.arange(h) * sc_)[:, None]
    cut = 346.0
    f = np.clip((cut - ys) / 3.0, 0, 1)
    im[..., 3] *= f
    im[..., 3] = np.where(ys > cut, 0, im[..., 3])
    Image.fromarray(np.clip(im, 0, 255).astype(np.uint8), "RGBA").save(LAY / f"{n}.png", optimize=True)
    print("hard-cut", n)
