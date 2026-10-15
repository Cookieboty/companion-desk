#!/usr/bin/env python3
"""Derive the non-destructive arm rig assets from the (brand-locked) master layers.

* body-noarm.png : master body.png with every pixel covered by arm-l / arm-r removed, so a lifted arm
                   does not leave a ghost sleeve behind. Every remaining pixel is byte-identical to body.png.
* hands/*.png    : hand pieces (see build-nomi-hands.py) copied next to the layers.

Usage: python3 scripts/brand/build-nomi-arm-parts.py <model dir> <hands out dir>
"""
import json, sys, shutil, os
import numpy as np, cv2
from PIL import Image

model = sys.argv[1].rstrip('/') + '/'
hands_dir = sys.argv[2].rstrip('/') + '/'
L = model + 'layers/'
man = json.load(open(model + 'manifest.json'))
offs = man['rig']['layers']
body = np.array(Image.open(L + 'body.png').convert('RGBA'))
H, W = body.shape[:2]
bx, by = offs['body'][:2]
erase = np.zeros((H, W), np.uint8)
for n in ('arm-l', 'arm-r'):
    a = np.array(Image.open(L + n + '.png').convert('RGBA'))[..., 3]
    ox, oy = int(offs[n][0] - bx), int(offs[n][1] - by)
    h, w = a.shape
    erase[oy:oy + h, ox:ox + w] |= (a > 8).astype(np.uint8)
er = cv2.dilate(erase, np.ones((3, 3), np.uint8), iterations=5)
out = body.copy()
out[..., 3] = np.where(er > 0, 0, out[..., 3])
# the cut leaves the jacket panels with a raw edge where the sleeve used to overlap them: ink a thin
# outline in the artwork's own line colour (sampled from the master body's darkest warm outline pixels)
# smeared leftovers of the original strap / pocket on the (viewer's right) jacket panel: paint them out
# with the surrounding panel colour (hidden under the sleeve in the master, visible once the arm lifts)
reg = np.zeros((H, W), np.uint8)
reg[300:470, 590:645] = 1
hsv = cv2.cvtColor(out[..., :3], cv2.COLOR_RGB2HSV)
smear = (reg > 0) & (out[..., 3] > 0) & ((hsv[..., 2] < 225) | (hsv[..., 1] > 40))
smear = cv2.dilate(smear.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=3)
smear[:, :592] = 0
ok = (reg > 0) & (out[..., 3] > 200) & (hsv[..., 2] >= 235) & (hsv[..., 1] < 40) & (smear == 0)
panel = np.median(out[..., :3][ok], axis=0)
sa = cv2.GaussianBlur(smear.astype(np.float32), (0, 0), 1.5)[..., None] * (out[..., 3:4] > 0)
out[..., :3] = (out[..., :3] * (1 - sa) + panel * sa).astype(np.uint8)
remain = (out[..., 3] > 128).astype(np.uint8)
edge = cv2.dilate((er > 0).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2) & remain
edge = edge & cv2.erode(remain, np.ones((3, 3), np.uint8), iterations=0)
inner = cv2.erode(remain, np.ones((3, 3), np.uint8), iterations=1)
edge = ((er_d := cv2.dilate(er, np.ones((3, 3), np.uint8), iterations=2)) > 0) & (remain > 0)
LINE = np.array([112, 78, 62], np.float32)
al = cv2.GaussianBlur(edge.astype(np.float32), (0, 0), 0.8)
al = np.clip(al * 1.3, 0, 1) * 0.85
rgb = out[..., :3].astype(np.float32)
out[..., :3] = (rgb * (1 - al[..., None]) + LINE * al[..., None]).astype(np.uint8)
out[out[..., 3] == 0, :3] = 0
Image.fromarray(out).save(L + 'body-noarm.png', optimize=True)

os.makedirs(L + 'hands', exist_ok=True)
info = json.load(open(hands_dir + 'hands.json'))
hands = {}
for n, i in info.items():
    shutil.copy(hands_dir + i['file'], L + 'hands/' + i['file'])
    hands[n] = dict(file='hands/' + i['file'], w=i['w'], h=i['h'], ax=i['ax'], ay=i['ay'], sleeveW=i['sleeveW'], cuffY=i['cuffY'])
# spine of each arm sleeve (least-squares centre line) in layer-local px, used by the mesh warp
arms = {}
for side, n in (('l', 'arm-l'), ('r', 'arm-r')):
    a = np.array(Image.open(L + n + '.png').convert('RGBA'))[..., 3] > 8
    rows = np.arange(100, 560)
    cx = np.array([np.nonzero(a[y])[0].mean() for y in rows])
    k, b = np.polyfit(rows, cx, 1)
    th = float(np.arctan(k))
    sgn = 1 if k > 0 else -1
    u = np.array([np.sin(th), np.cos(th)])
    w = np.array([np.cos(th), -np.sin(th)])
    ys, xs = np.nonzero(a)
    rel = np.stack([xs - b, ys - 0.0], 1)
    sv, nv = rel @ u, rel @ w
    arms[side] = dict(layer=n, sgn=sgn, theta=round(abs(th), 5), s0=[round(float(b), 2), 0.0],
                      smin=round(float(sv.min()), 1), smax=round(float(sv.max()), 1),
                      nmin=round(float(nv.min()), 1), nmax=round(float(nv.max()), 1))
man['rig']['arms'] = arms
man['rig']['layers']['body-noarm'] = list(offs['body'])
man['rig']['hands'] = hands
json.dump(man, open(model + 'manifest.json', 'w'), indent=2, ensure_ascii=False)
print('ok', list(hands))
