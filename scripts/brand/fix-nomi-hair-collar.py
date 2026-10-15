#!/usr/bin/env python3
"""Re-cut idle collar hair tips using user HD halfbody pixels (brand-locked).

Master sources
--------------
- Pose / tip topology: docs/brand/reference/nomi-clean-halfbody.jpg (idle-matched)
- Strand color + sharper tip detail: docs/brand/reference/user-halfbody-hd.png
  (chin-on-hand pose — NOT a full-body replace; tip bands only)

Pipeline
--------
1. Local affine warps map HD L/R tip regions into the idle tip band at 2x
   supersampling (hand/skin rejected so the chin-on-hand pose cannot leak).
2. Silhouette stays pose-matched to the old official hard key, lightly
   contour-smoothed; HD strands may extend only where they touch that mask.
3. Tip-band RGB prefers HD where safe, else old official; pale fringe recolored;
   alpha is hard 0/255 (tiny top feather).
4. Head tip fringe punched outside the neck column; hair-side bottoms hard-cut
   above the tip band (no double-draw).

Limits: full pixel-perfect transfer is impossible — HD pose puts a hand under
the chin and changes hair fall. We sample tip quality/colors onto idle geometry.

Usage:
  python3 scripts/brand/fix-nomi-hair-collar.py \\
    <old-official-halfbody.jpg> <layers-dir> [<user-halfbody-hd.png>]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

OLD_REF = sys.argv[1]
LAY = Path(sys.argv[2])
HD_REF = sys.argv[3] if len(sys.argv) > 3 else str(
    Path(__file__).resolve().parents[2] / "docs/brand/reference/user-halfbody-hd.png"
)

BO = (66, 291)
Y0, Y1 = 328, 428
ZONES = [(255, 425), (530, 700)]
SCALE = 2
m = json.loads((LAY.parent / "manifest.json").read_text())

hd = np.array(Image.open(HD_REF).convert("RGB"))
old_1x = cv2.bilateralFilter(
    np.array(
        Image.open(OLD_REF)
        .convert("RGB")
        .crop((400, 0, 880, 560))
        .resize((960, 1120), Image.LANCZOS)
    ),
    5,
    20,
    5,
)
W, H = 960 * SCALE, 1120 * SCALE
old = cv2.resize(old_1x, (W, H), interpolation=cv2.INTER_LANCZOS4)


def tip_warp(hd_pts, idle_pts):
    idle2 = np.float32(idle_pts) * SCALE
    Hm, _ = cv2.estimateAffinePartial2D(np.float32(hd_pts), idle2, method=cv2.LMEDS)
    return Hm


H_R = tip_warp(
    [[860, 600], [1000, 680], [940, 820], [1080, 760], [820, 740], [960, 900]],
    [[550, 335], [670, 360], [630, 415], [710, 395], [560, 400], [640, 420]],
)
H_L = tip_warp(
    [[300, 580], [420, 660], [380, 780], [250, 720], [450, 740], [340, 820]],
    [[290, 335], [400, 355], [360, 415], [270, 385], [410, 395], [330, 420]],
)

hd_R = cv2.warpAffine(
    hd, H_R, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255)
)
hd_L = cv2.warpAffine(
    hd, H_L, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255)
)
hd_tips = old.copy()
zL = (255 * SCALE, 425 * SCALE)
zR = (530 * SCALE, 700 * SCALE)
hd_tips[:, zL[0] : zL[1]] = hd_L[:, zL[0] : zL[1]]
hd_tips[:, zR[0] : zR[1]] = hd_R[:, zR[0] : zR[1]]


def hard_key(rgb):
    rgb = rgb.astype(np.float32)
    white = rgb.min(2)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = rgb.mean(2)
    is_hair = (white < 210) & (lum < 175) & (sat > 0.10) & (rgb[:, :, 0] + 15 > rgb[:, :, 2])
    is_orange = (rgb[:, :, 0] > 140) & (rgb[:, :, 0] > rgb[:, :, 2] + 35) & (sat > 0.22) & (lum < 210)
    is_dark = (lum < 55) & (white < 80)
    c = (is_hair | is_orange | is_dark).astype(np.uint8)
    c = cv2.morphologyEx(c, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    c = cv2.morphologyEx(c, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return c


def is_skin(rgb):
    rgb = rgb.astype(np.float32)
    sat = (rgb.max(2) - rgb.min(2)) / np.maximum(rgb.max(2), 1)
    s = ((rgb[:, :, 0] > 195) & (rgb[:, :, 1] > 155) & (rgb[:, :, 2] > 140) & (sat < 0.40)).astype(np.uint8)
    return cv2.dilate(s, np.ones((9, 9), np.uint8))


def smooth_contour_mask(sil):
    sil = sil.astype(np.uint8)
    cnts, _ = cv2.findContours(sil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = np.zeros_like(sil)
    for c in cnts:
        if cv2.contourArea(c) < 40:
            continue
        eps = 0.0018 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, True)
        cv2.drawContours(out, [approx], -1, 1, thickness=-1)
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    blur = cv2.GaussianBlur(out.astype(np.float32), (7, 7), 1.2)
    return (blur > 0.42).astype(np.uint8)


def build_zone_1x(x0, x1):
    y0s, y1s = Y0 * SCALE, Y1 * SCALE
    x0s, x1s = x0 * SCALE, x1 * SCALE
    sl = (slice(y0s, y1s), slice(x0s, x1s))
    old_rgb = old[sl].astype(np.float32)
    hd_rgb = hd_tips[sl].astype(np.float32)
    old_m = hard_key(old_rgb)
    hd_m = hard_key(hd_rgb)
    skin = is_skin(hd_rgb)
    old_m = np.where(old_rgb.min(2) > 238, 0, old_m)
    hd_m = np.where((hd_rgb.min(2) > 238) | (skin > 0), 0, hd_m)

    old_dil = cv2.dilate(old_m, np.ones((7, 7), np.uint8))
    sil = ((old_m > 0) | ((hd_m > 0) & (old_dil > 0))).astype(np.uint8)
    sil = smooth_contour_mask(sil)

    nlab, lab, stats, _ = cv2.connectedComponentsWithStats(sil, 8)
    keep = np.zeros_like(sil)
    for i in range(1, nlab):
        touches_top = (lab[0] == i).any()
        area = stats[i, cv2.CC_STAT_AREA]
        if (touches_top and area >= 80) or area >= 2500:
            keep[lab == i] = 1
    sil = keep

    use_hd = (sil > 0) & (hd_m > 0) & (skin == 0)
    use_old = (sil > 0) & ~use_hd
    out_rgb = np.zeros_like(old_rgb)
    out_rgb[use_hd] = hd_rgb[use_hd]
    out_rgb[use_old] = old_rgb[use_old]
    lum = out_rgb.mean(2)
    pale = (sil > 0) & (lum > 145)
    dark = (sil > 0) & (lum < 125)
    if dark.any():
        out_rgb[pale] = out_rgb[dark].mean(0)
    tip_u8 = cv2.bilateralFilter(np.clip(out_rgb, 0, 255).astype(np.uint8), 7, 50, 7)
    out_rgb = np.where(sil[..., None] > 0, tip_u8.astype(np.float32), 0)

    sil1 = cv2.resize(sil.astype(np.float32), (x1 - x0, Y1 - Y0), interpolation=cv2.INTER_AREA)
    rgb1 = cv2.resize(np.clip(out_rgb, 0, 255).astype(np.uint8), (x1 - x0, Y1 - Y0), interpolation=cv2.INTER_AREA).astype(
        np.float32
    )
    alpha = np.where(sil1 > 0.45, 255.0, 0.0)
    rgb1 = np.where(alpha[..., None] > 0, rgb1, 0)
    yy = np.arange(Y0, Y1)[:, None]
    top = np.clip((yy - Y0) / 5.0, 0, 1)
    feather = (alpha > 0) & np.broadcast_to(yy < Y0 + 5, alpha.shape)
    alpha = np.where(feather, 255.0 * np.broadcast_to(top * top * (3 - 2 * top), alpha.shape), alpha)
    lum = rgb1.mean(2)
    pale = (alpha > 0) & (lum > 150)
    dark = (alpha > 0) & (lum < 130)
    if dark.any():
        rgb1[pale] = rgb1[dark].mean(0)
    print(f"zone {x0}-{x1}: opaque={(alpha > 0).sum()} hd2x={int(use_hd.sum())} old2x={int(use_old.sum())}")
    return rgb1, alpha


def smooth(x, a, b):
    t = np.clip((x - a) / max(1e-6, b - a), 0, 1)
    return t * t * (3 - 2 * t)


def patch_body(name):
    im = np.array(Image.open(LAY / name).convert("RGBA")).astype(np.float32)
    h, w = im.shape[:2]
    full = np.zeros((1120, 960, 4), np.float32)
    full[BO[1] : BO[1] + h, BO[0] : BO[0] + w] = im
    out = full.copy()
    for x0, x1 in ZONES:
        sl = (slice(Y0, Y1), slice(x0, x1))
        rgb, alpha = build_zone_1x(x0, x1)
        yy = np.arange(Y0, Y1)[:, None]
        tipb = np.broadcast_to(yy < 410, alpha.shape)
        cleared = out[sl].copy()
        cleared[..., 3] = np.where(tipb, 0, cleared[..., 3])
        cleared[..., :3] = np.where(tipb[..., None], 0, cleared[..., :3])
        use = alpha > 0.5
        dst = cleared
        for c in range(3):
            dst[..., c] = np.where(use, rgb[..., c], dst[..., c])
        a = np.where(use | tipb, alpha, dst[..., 3])
        oldpix = full[sl]
        keep_old = (~tipb) & (~use) & (oldpix[..., 3] > 200)
        dst[keep_old] = oldpix[keep_old]
        dst[..., 3] = np.where(keep_old, oldpix[..., 3], a)
        dst[..., 3] = np.where(tipb & ~use, 0, dst[..., 3])
        dst[..., :3] = np.where((tipb & ~use)[..., None], 0, dst[..., :3])
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
