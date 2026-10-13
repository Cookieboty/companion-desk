#!/usr/bin/env python3
"""Stage 2: rebuild the Nomi face layers from the owner's HD close-up.

Local only (numpy, Pillow, opencv-python-headless). Usage:
  python3 build-nomi-face-hd.py <nomi-owner-face-closeup.png> <rig-out-dir/>
Reads <rig-out-dir>/rig.json + head.png from stage 1 (build-nomi-rig.py) and writes
hi-res (2x rig density) face layers + updates rig.json.
"""
import sys, json
import numpy as np, cv2
from PIL import Image, ImageDraw
CU = sys.argv[1] if len(sys.argv) > 1 else 'nomi-owner-face-closeup.png'
OUT = (sys.argv[2].rstrip('/') + '/') if len(sys.argv) > 2 else 'out/'
D = 2  # density of hd layers relative to rig px
rig = json.load(open(OUT + 'rig.json'))
cu = np.asarray(Image.open(CU).convert('RGB')).astype(np.float32)
CH, CW = cu.shape[:2]
# landmarks: close-up px  ->  half-body px (stage-1 crop X0=400, S=2) -> hd px
X0, S = 400, 2
def hb2hd(x, y): return ((x - X0) * S * D, y * S * D)
src = np.float32([[508, 579], [800, 508], [693, 737]])
dst = np.float32([hb2hd(603.5, 132.5), hb2hd(665, 125.5), hb2hd(637.5, 165.5)])
M = cv2.getAffineTransform(src, dst)
# hd working window (covers the face) in hd px
WX0, WY0, WX1, WY1 = 600, 300, 1300, 860
M[:, 2] -= [WX0, WY0]
WW, WH = WX1 - WX0, WY1 - WY0
def warp(img, interp=cv2.INTER_AREA):
    return cv2.warpAffine(img, M, (WW, WH), flags=interp | cv2.WARP_FILL_OUTLIERS, borderMode=cv2.BORDER_REPLICATE)
def soft(m, s): return cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)
lum = cu @ np.array([.299, .587, .114]); hsv = cv2.cvtColor(cu.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
yy, xx = np.mgrid[0:CH, 0:CW]
def circle(cx, cy, r): return ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
def fill_holes(m):
    m = m.astype(np.uint8); h, w = m.shape; ff = m.copy(); mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 1); return (m | (1 - ff)).astype(bool)
eyes = {}
for name, (cx, cy, r), box in [('l', (507, 579, 49), (385, 520, 600, 640)), ('r', (800, 509, 53), (725, 445, 905, 565))]:
    bx = np.zeros((CH, CW), bool); bx[box[1]:box[3], box[0]:box[2]] = True
    iris = circle(cx, cy, r) & bx & ((hsv[..., 1] > 85) | (lum < 130) | (lum > 235))
    sclera = bx & (lum > 190) & (hsv[..., 1] < 32)
    dark = bx & (lum < 95)
    op = cv2.morphologyEx(((sclera | iris) & ~(dark & ~circle(cx, cy, r * 0.8))).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(op); k = 1 + np.argmax(st[1:, 4]); op = fill_holes(lab == k)
    op = cv2.morphologyEx(op.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)
    op &= cv2.dilate((sclera | iris).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)  # no skin wings
    # upper lid: everything above the opening's top edge within the iris circle is lid/lash
    cols = np.where(op.any(0))[0]
    lash = np.zeros_like(op)
    ring = cv2.dilate(op.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool) & ~op
    lash = ring & (lum < 120) & bx
    lash = cv2.dilate(lash.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) | (bx & (lum < 70) & ~circle(cx, cy, r * 0.97) & cv2.dilate(op.astype(np.uint8), np.ones((31, 31), np.uint8)).astype(bool))
    eyes[name] = dict(c=(cx, cy), r=r, op=op, iris=iris & op, lash=lash, box=box)
# --- skin under eyes/mouth (inpaint the openings tightly)
skin = cu.copy()
hole = np.zeros((CH, CW), bool)
for e in eyes.values():
    near = cv2.dilate(e['op'].astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 41))).astype(bool)
    hole |= cv2.dilate((e['op'] | e['lash'] | (near & (lum < 140))).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
# mouth: dark corner strokes + lips region
mbox = np.zeros((CH, CW), bool); mbox[700:770, 615:775] = True
mouth_m = mbox & ((lum < 200) | (hsv[..., 1] > 60)) & ((hsv[..., 0] < 15) | (hsv[..., 0] > 165) | (lum < 120) | (lum > 235))
mouth_m = cv2.morphologyEx(mouth_m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool)
n, lab, st, _ = cv2.connectedComponentsWithStats(mouth_m.astype(np.uint8)); k = 1 + np.argmax(st[1:, 4]); mouth_m = fill_holes(lab == k)
hole |= cv2.dilate(mouth_m.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
# fill with a smooth skin field from nearby *skin* pixels only (normalised convolution),
# so dark lashes / hair never bleed into the painted lid area
valid = (~hole & (lum > 165) & (hsv[..., 1] < 120)).astype(np.float32)
fillc = np.zeros_like(cu)
for sig in (40,):
    num = cv2.GaussianBlur(cu * valid[..., None], (0, 0), sig); den = cv2.GaussianBlur(valid, (0, 0), sig)[..., None]
    fillc = num / np.maximum(den, 1e-4)
hs = np.clip(soft(cv2.dilate(hole.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))), 9) * 1.3, 0, 1)[..., None]; skin = cu * (1 - hs) + fillc * hs
# --- face patch mask (close-up coords): eyes+brows band, nose, mouth, right cheek; hand region excluded
fm = np.zeros((CH, CW), np.float32)
cv2.ellipse(fm, (505, 575), (150, 95), -14, 0, 360, 1, -1)
cv2.ellipse(fm, (810, 505), (150, 95), -14, 0, 360, 1, -1)
cv2.ellipse(fm, (660, 600), (210, 170), -14, 0, 360, 1, -1)
cv2.ellipse(fm, (700, 730), (120, 70), -14, 0, 360, 1, -1)
hand = np.zeros((CH, CW), np.uint8)
cv2.fillPoly(hand, [np.int32([[270, 640], [420, 650], [560, 760], [600, 900], [250, 920]])], 1)
fm *= (1 - soft(hand, 30))
# keep out obvious hair at the patch fringe (dark, outside eyes) so close-up strands don't fight half-body bangs
hairish = (lum < 120) & ~cv2.dilate(np.any([e['op'] | e['lash'] for e in eyes.values()], 0).astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool)
hairish = cv2.dilate(hairish.astype(np.uint8), np.ones((9, 9), np.uint8))
fm *= (1 - soft(hairish, 6) * soft(1 - circle(655, 600, 120), 30))
fm = np.clip(soft(fm, 10) * 1.15, 0, 1)
# --- colour-match close-up skin to half-body skin
head = Image.open(OUT + 'head.png').convert('RGBA'); ho = rig['layers']['head']
hb = np.zeros((rig['size'][1], rig['size'][0], 4), np.float32)
ha = np.asarray(head).astype(np.float32); hb[ho[1]:ho[1] + ha.shape[0], ho[0]:ho[0] + ha.shape[1]] = ha
hb_hd = cv2.resize(hb, None, fx=D, fy=D, interpolation=cv2.INTER_CUBIC)[WY0:WY1, WX0:WX1]
ws = warp(skin); wf = warp(fm, cv2.INTER_LINEAR)
ref = (wf > 0.8) & (hb_hd[..., 3] > 250)
hbr = hb_hd[..., :3]
hl = hbr @ np.array([.299, .587, .114]); wl = ws @ np.array([.299, .587, .114])
sk = ref & (hl > 170) & (wl > 170)
gain = (hbr[sk].mean(0) + 1) / (ws[sk].mean(0) + 1)
print('colour gain', gain, sk.sum())
def cm(img): return np.clip(img * gain, 0, 255)
def save(name, rgb, a, crop=True):
    arr = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8); arr[arr[..., 3] < 3] = 0
    im = Image.fromarray(arr, 'RGBA'); bb = im.getbbox() or (0, 0, 1, 1)
    bb = (max(bb[0] - 2, 0), max(bb[1] - 2, 0), min(bb[2] + 2, WW), min(bb[3] + 2, WH))
    im.crop(bb).save(OUT + name + '.png', optimize=True)
    rig['layers'][name] = [(WX0 + bb[0]) / D, (WY0 + bb[1]) / D, 1 / D]
face = cm(ws)
# low-frequency shading match so the patch edge disappears into the half-body skin
hl_ok = (hb_hd[..., 3] > 250) & (hl > 165) & (wl > 165) & (wf > 0.05)
v = hl_ok.astype(np.float32)[..., None]
corr = (cv2.GaussianBlur(hbr * v, (0, 0), 22) + 1) / (cv2.GaussianBlur(face * v, (0, 0), 22) + 1)
corr = np.where(cv2.GaussianBlur(v, (0, 0), 22)[..., None] > 0.05, corr, 1.0)
face = np.clip(face * np.clip(corr, 0.85, 1.15), 0, 255)
save('face-hd', face, wf)
full = cm(warp(cu))
for n, e in eyes.items():
    op = warp(soft(e['op'], 0.8), cv2.INTER_LINEAR); lash = warp(soft(e['lash'], 0.8), cv2.INTER_LINEAR)
    # sclera with iris painted out (white fill clipped to the opening)
    sc = cu.copy(); ir = cv2.dilate(e['iris'].astype(np.uint8), np.ones((5, 5), np.uint8))
    # sclera field from sclera pixels only + the art's soft upper-lid shadow
    sv = (e['op'] & ~cv2.dilate(e['iris'].astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & (lum > 190) & (hsv[..., 1] < 32)).astype(np.float32)
    num = cv2.GaussianBlur(cu * sv[..., None], (0, 0), 12); den = cv2.GaussianBlur(sv, (0, 0), 12)[..., None]
    base = np.where(den > 1e-3, num / np.maximum(den, 1e-4), np.array([238, 232, 230], np.float32))
    ys, xs = np.where(e['op']); top, bot = ys.min(), ys.max()
    shade = np.clip((yy - top) / max(1, (bot - top) * 0.45), 0, 1)[..., None]
    scl = base * (0.80 + 0.20 * shade)
    save(f'eye-white-{n}', cm(warp(scl)), op)
    irm = soft(circle(*e['c'], e['r']), 0.8)
    save(f'iris-{n}', full, warp(irm, cv2.INTER_LINEAR))
    # lashes get slightly bolder so they survive the ~0.4x on-screen downscale
    lash_b = np.clip(soft(cv2.dilate(e['lash'].astype(np.uint8), np.ones((3, 3), np.uint8)), 0.8) * 1.0, 0, 1)
    save(f'lash-{n}', full * 0.82, warp(lash_b, cv2.INTER_LINEAR))
    # closed lid in the art style: the upper lash stroke, flipped & flattened onto the lower lid
    ys, xs = np.where(e['lash'] & (yy < e['c'][1]))
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    strip = np.dstack([cu, soft(e['lash'] & (yy < e['c'][1] - e['r'] * 0.15), 0.8) * 255])[y0:y1 + 1, x0:x1 + 1]
    strip = strip[::-1]  # ∩ → ∪
    hgt = max(6, int((y1 - y0) * 0.45))
    strip = cv2.resize(strip, (strip.shape[1], hgt), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((CH, CW, 4), np.float32)
    oy = int(e['c'][1] + e['r'] * 0.35)
    canvas[oy:oy + hgt, x0:x1 + 1] = strip
    lid_rgb = canvas[..., :3]; lid_a = canvas[..., 3] / 255
    save(f'lid-{n}', cm(warp(lid_rgb)), warp(lid_a, cv2.INTER_LINEAR))
    # happy ^^ : the lash arc itself, thinned
    up = np.zeros((CH, CW, 4), np.float32)
    s2 = np.dstack([cu, soft(e['lash'] & (yy < e['c'][1] - e['r'] * 0.15), 0.8) * 255])[y0:y1 + 1, x0:x1 + 1]
    s2 = cv2.resize(s2, (s2.shape[1], max(6, int((y1 - y0) * 0.6))), interpolation=cv2.INTER_AREA)
    oy2 = int(e['c'][1] - e['r'] * 0.1); up[oy2:oy2 + s2.shape[0], x0:x1 + 1] = s2
    save(f'happy-{n}', cm(warp(up[..., :3])), warp(up[..., 3] / 255, cv2.INTER_LINEAR))
    rig['anchors'][f'iris{n.upper()}'] = [float(v) / D for v in (M @ [*e['c'], 1] + [WX0, WY0])]
    rig.setdefault('irisRadius', {})[n] = float(e['r'] * np.hypot(*M[0, :2]) / D)
# mouth variants (all from the close-up art)
ma = soft(mouth_m, 0.8)
save('mouth-open', full, warp(ma, cv2.INTER_LINEAR))
# closed: keep the dark lip line (top edge + corners), skin elsewhere
line = mouth_m & ((lum < 150) | ~cv2.erode(mouth_m.astype(np.uint8), np.ones((1, 9), np.uint8)).astype(bool))
top = np.zeros_like(mouth_m)
for x in np.where(mouth_m.any(0))[0]:
    ys = np.where(mouth_m[:, x])[0]; top[ys.min():ys.min() + 4, x] = True
closed = soft((line & (lum < 150)) | top, 0.7)
lipcol = np.where(top[..., None], cu * 0.75, cu)
cy0 = 737; sq = 0.5
Ms = np.float32([[1, 0, 0], [0, sq, cy0 * (1 - sq)]])
sqrgb = cv2.warpAffine(cu, Ms, (CW, CH), flags=cv2.INTER_AREA); sqa = cv2.warpAffine(ma, Ms, (CW, CH), flags=cv2.INTER_LINEAR)
save('mouth', cm(warp(sqrgb)), warp(sqa, cv2.INTER_LINEAR))
mc = np.float32([[693, 737]])
rig['anchors']['mouth'] = [float(v) / D for v in (M @ [693, 737, 1] + [WX0, WY0])]
# frown: closed line flipped vertically about its centre
ys, xs = np.where(closed > 0.05); y0, y1 = ys.min(), ys.max()
fr = np.zeros((CH, CW, 4), np.float32); seg = np.dstack([lipcol, closed * 255])[y0:y1 + 1]
fr[y0:y1 + 1] = seg[::-1]
save('mouth-frown', cm(warp(fr[..., :3])), warp(fr[..., 3] / 255, cv2.INTER_LINEAR))
save('mouth-o', full, warp(ma, cv2.INTER_LINEAR))  # renderer squashes horizontally
for k in ['eye-l', 'eye-r', 'eyes-closed', 'eyes-happy']: rig['layers'].pop(k, None)
json.dump(rig, open(OUT + 'rig.json', 'w'), indent=1)
print(json.dumps(rig['anchors']))
# The left eye in the close-up is crossed by bang strands and its lashes are fragmented, so
# the whole left eye (white, iris, lashes, closed lid, happy arc) is the clean right eye
# mirrored with one rigid transform (flip about the iris centre, rotate to the eye line).
import math
ANG = -13.0
def mirror_to_left(name):
    im = Image.open(OUT + f'{name}-r.png'); o = rig['layers'][f'{name}-r']; sc = o[2]
    cx = o[0] + im.width * sc / 2; cy = o[1] + im.height * sc / 2
    aR, aL = rig['anchors']['irisR'], rig['anchors']['irisL']
    dx, dy = -(cx - aR[0]), cy - aR[1]
    t = math.radians(-ANG)  # PIL rotates counter-clockwise for positive angles (y down → visual)
    rx = dx * math.cos(t) - dy * math.sin(t); ry = dx * math.sin(t) + dy * math.cos(t)
    fl = im.transpose(Image.FLIP_LEFT_RIGHT).rotate(ANG, resample=Image.BICUBIC, expand=True)
    ncx, ncy = aL[0] + rx, aL[1] + ry
    fl.save(OUT + f'{name}-l.png', optimize=True)
    rig['layers'][f'{name}-l'] = [ncx - fl.width * sc / 2, ncy - fl.height * sc / 2, sc]
for nm in ('eye-white', 'iris', 'lash', 'lid', 'happy'): mirror_to_left(nm)
rig['irisRadius']['l'] = rig['irisRadius']['r']
json.dump(rig, open(OUT + 'rig.json', 'w'), indent=1)
