#!/usr/bin/env python3
"""Cut every part of rive/nomi-sheet/nomi-layer-sheet.png (parts panel; baked-in checkerboard, no true alpha) into
RGBA PNGs in rive/nomi-sheet/parts/.  Method: background candidate = light, unsaturated pixels (checker greys/whites);
flood-fill the candidate from the bbox border through a 1px-closed outline barrier; everything not reached is the part
(holes inside the outline stay opaque, so white sleeves are kept); soft 1px edge.  Native resolution, no resampling."""
import json, sys
from pathlib import Path
import numpy as np, cv2
ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / 'rive/nomi-sheet/nomi-layer-sheet.png'
OUT = ROOT / 'rive/nomi-sheet/parts'; OUT.mkdir(parents=True, exist_ok=True)
# bbox (x, y, w, h) in sheet px from connected-components of the panel (see docs); manual splits noted
PARTS = {
 'hair-back': (556, 73, 104, 116), 'hair-front': (660, 73, 104, 116), 'hair-side-l': (773, 84, 59, 104), 'hair-side-r': (850, 85, 58, 102),
 'bangs': (918, 98, 84, 70),
 'face': (560, 226, 82, 116), 'eye-l': (655, 250, 73, 57), 'eye-r': (756, 252, 66, 53), 'brow': (849, 262, 59, 39), 'mouth': (930, 261, 66, 42),
 'torso': (556, 353, 100, 143), 'jacket-l': (659, 353, 108, 145), 'jacket-r': (776, 356, 95, 141), 'jacket-back': (873, 357, 128, 138),
 'forearm-l': (578, 539, 42, 101), 'forearm-r': (670, 540, 67, 101), 'hand-l': (797, 540, 43, 88), 'hand-r': (903, 540, 43, 100),
 'shorts': (561, 693, 116, 101), 'thigh-l': (731, 673, 44, 119), 'thigh-r': (792, 672, 51, 121), 'calf-l': (882, 679, 34, 113), 'calf-r': (955, 680, 35, 112),
 'shoe-l': (564, 859, 73, 83), 'shoe-r': (654, 860, 71, 90), 'belt-acc': (749, 863, 74, 66), 'bag': (830, 849, 93, 94), 'badge': (956, 849, 36, 95),
 'hair-acc-1': (560, 1010, 75, 68), 'hair-acc-2': (658, 1009, 34, 66), 'choker': (729, 1022, 69, 54), 'star-pendant': (832, 1014, 27, 62),
 'tie-piece': (891, 1012, 25, 68), 'other-acc': (935, 1009, 53, 68),
}
def key_part(im, box, pad=6):
    x, y, w, h = box; H, W = im.shape[:2]
    x0, y0, x1, y1 = max(x - pad, 0), max(y - pad, 0), min(x + w + pad, W), min(y + h + pad, H)
    c = im[y0:y1, x0:x1]
    hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV)
    bgc = ((c.min(2) > 226) & (hsv[..., 1] < 24)).astype(np.uint8)
    barrier = cv2.dilate(1 - bgc, np.ones((3, 3), np.uint8))          # close 1px outline gaps
    free = (1 - barrier).astype(np.uint8)
    # flood from the crop border over free pixels
    ff = np.zeros((free.shape[0] + 2, free.shape[1] + 2), np.uint8)
    lab = free.copy() * 255
    seeds = [(i, 0) for i in range(free.shape[1])] + [(i, free.shape[0] - 1) for i in range(free.shape[1])] + \
            [(0, j) for j in range(free.shape[0])] + [(free.shape[1] - 1, j) for j in range(free.shape[0])]
    for sx, sy in seeds:
        if lab[sy, sx] == 255: cv2.floodFill(lab, ff, (sx, sy), 128)
    outside = (lab == 128).astype(np.uint8)
    # outside was computed with the dilated barrier: grow it back by 1px but only over bg candidates
    outside = cv2.dilate(outside, np.ones((3, 3), np.uint8)) & bgc
    part = 1 - outside
    # drop specks (checker fragments / label text): keep components > 30 px, then fill holes
    n, l2, st, _ = cv2.connectedComponentsWithStats(part, connectivity=8)
    keep = np.zeros_like(part)
    if n > 1:
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); keep[l2 == big] = 1
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] > 0.15 * st[big, cv2.CC_STAT_AREA]: keep[l2 == i] = 1
    a = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 0.7)
    a = np.clip((a - 0.25) / 0.5, 0, 1)
    out = np.dstack([c, (a * 255).astype(np.uint8)]); out[a == 0, :3] = 0
    ys, xs = np.where(out[..., 3] > 8)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1], (x0 + xs.min(), y0 + ys.min())
if __name__ == '__main__':
    im = cv2.imread(str(SHEET)); meta = {}
    for name, box in PARTS.items():
        rgba, org = key_part(im, box)
        cv2.imwrite(str(OUT / f'{name}.png'), rgba)
        meta[name] = dict(sheet_xy=[int(org[0]), int(org[1])], size=[int(rgba.shape[1]), int(rgba.shape[0])], opaque_px=int((rgba[..., 3] > 128).sum()))
    (OUT / 'parts.json').write_text(json.dumps(meta, indent=1))
    # contact sheet on magenta for review
    cell = 190; cols = 6; rows = (len(PARTS) + cols - 1) // cols
    cs = np.full((rows * cell, cols * cell, 3), (255, 0, 255), np.uint8)
    for i, name in enumerate(PARTS):
        p = cv2.imread(str(OUT / f'{name}.png'), cv2.IMREAD_UNCHANGED); s = min((cell - 8) / p.shape[1], (cell - 8) / p.shape[0], 1.8)
        p2 = cv2.resize(p, (max(1, int(p.shape[1] * s)), max(1, int(p.shape[0] * s))), interpolation=cv2.INTER_CUBIC)
        r, cc = divmod(i, cols); yy = r * cell + 4; xx = cc * cell + 4
        al = p2[..., 3:4].astype(np.float32) / 255; reg = cs[yy:yy + p2.shape[0], xx:xx + p2.shape[1]]
        cs[yy:yy + p2.shape[0], xx:xx + p2.shape[1]] = (p2[..., :3] * al + reg * (1 - al)).astype(np.uint8)
        cv2.putText(cs, name, (cc * cell + 3, r * cell + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 1)
    cv2.imwrite('/workspace/screenshots/nomi-rive-sheet/parts-contact-magenta.png', cs)
    print('cut', len(meta))
