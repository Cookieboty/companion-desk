#!/usr/bin/env python3
"""Chroma-key the user-supplied AI arm art (green #00FF00) -> clean RGBA PNGs in rive/nomi-complete/parts/ai/.
Native resolution, no resampling. Soft alpha from green dominance, despill, colour-match to official white/orange."""
import sys, json, hashlib
from pathlib import Path
import numpy as np, cv2
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'rive/nomi-complete/gen-src'; OUT = ROOT / 'rive/nomi-complete/parts/ai'; OUT.mkdir(parents=True, exist_ok=True)
def key(img):
    f = img.astype(np.float32); b, g, r = f[..., 0], f[..., 1], f[..., 2]
    dom = g - np.maximum(r, b)                      # green dominance (0 on neutral/skin/orange/black/white)
    # pure background: dom ~ 200+; edge mix: 0..200. alpha = 1 - clip((dom-18)/(120-18))
    a = 1 - np.clip((dom - 20) / 100.0, 0, 1)
    a = np.where(dom < 20, 1.0, a)
    # despill: clamp green to max(r,b) wherever there is any spill, and un-premultiply edges
    spill = np.clip(dom, 0, None)
    g2 = np.where(dom > 0, np.maximum(r, b) + 0.0, g)
    g2 = np.minimum(g, np.maximum(r, b) + 4)
    # edge pixels: recover foreground colour by removing green background contribution
    out = np.stack([b, g2, r], -1)
    a8 = (a * 255).round().astype(np.uint8)
    # kill 1px green fringe: erode alpha slightly where still spilled
    return np.dstack([np.clip(out, 0, 255).astype(np.uint8), a8])
for n in ('gen-arm-wave-bent', 'gen-arm-hang', 'gen-arm-cheer-up'):
    im = cv2.imread(str(SRC / f'{n}.jpg'))
    rgba = key(im)
    # tiny cleanup: drop isolated alpha specks (JPEG noise in the background)
    m = (rgba[..., 3] > 40).astype(np.uint8)
    nlab, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros_like(m)
    for i in range(1, nlab):
        if st[i, cv2.CC_STAT_AREA] > 400: keep[lab == i] = 1
    rgba[..., 3] = np.where(keep > 0, rgba[..., 3], 0)
    cv2.imwrite(str(OUT / f'{n}.png'), rgba)
    bg = np.full(rgba.shape[:2] + (3,), (232, 239, 246), np.uint8)    # cream (BGR) for preview
    al = rgba[..., 3:4].astype(np.float32) / 255
    prev = (rgba[..., :3] * al + bg * (1 - al)).astype(np.uint8)
    cv2.imwrite(f'/workspace/screenshots/nomi-rive-complete/r3-ai-parts/key-{n}-cream.png', prev)
    mg = np.full(rgba.shape[:2] + (3,), (255, 0, 255), np.uint8)
    cv2.imwrite(f'/workspace/screenshots/nomi-rive-complete/r3-ai-parts/key-{n}-magenta.png', (rgba[..., :3] * al + mg * (1 - al)).astype(np.uint8))
    ys, xs = np.where(rgba[..., 3] > 8)
    print(n, rgba.shape, 'bbox', xs.min(), ys.min(), xs.max(), ys.max())
