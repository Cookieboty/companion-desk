#!/usr/bin/env python3
"""Repaint the Nomi brand parts of the master rig from the official design art.

The first rig cut (build-nomi-rig.py / build-nomi-head-hd.py) came from a generated half-body whose
hair clip, bow, hair bands, choker charm and earring had drifted from the official design.
This one-shot script cuts those parts out of the official close-up (docs/brand/reference/) and
pastes them into the master layers. No generative redraw is involved: only crops of the official
artwork, rotation / scaling and plain inpainting of the hair that was underneath.

Usage: python3 scripts/brand/fix-nomi-brand-parts.py docs/brand/reference/nomi-closeup.png <old-layers+manifest dir/> <out dir/>
(Applied once; the committed layers are the source of truth afterwards - see docs/BRAND.md.)
"""
import sys, json
import numpy as np, cv2
from PIL import Image

REF, SRC, OUT = sys.argv[1], sys.argv[2].rstrip('/') + '/', sys.argv[3].rstrip('/') + '/'
ref = np.array(Image.open(REF).convert('RGB'))
head = np.array(Image.open(SRC + 'head.png').convert('RGBA')).astype(np.float32)
body = np.array(Image.open(SRC + 'body.png').convert('RGBA')).astype(np.float32)
HS = 0.66                    # head layers are authored at 1/0.66 of rig density
HO = (264.12, 70.8)          # head layer origin in rig space
H, W = head.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]


def soft(m, s):
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)


def hsv_of(rgb):
    return cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)


AVOID = None


def hair_fill(img, mask, shifts):
    """Fill `mask` with hair texture copied from the best-matching nearby shifted patch."""
    ring = (cv2.dilate(mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0) & ~(mask > 0)
    best = None
    ys, xs = np.nonzero(mask > 0)
    if len(ys) == 0:
        return img
    for dy, dx in shifts:
        sy, sx = ys + dy, xs + dx
        if sy.min() < 0 or sx.min() < 0 or sy.max() >= H or sx.max() >= W:
            continue
        if AVOID is not None and AVOID[sy, sx].any():
            continue
        src_a = img[sy, sx, 3]
        if (src_a < 250).mean() > 0.12:
            continue
        s = hsv_of(img[..., :3])[sy, sx]
        if ((s[:, 1] > 150) & (s[:, 2] > 120)).mean() > 0.05 or (s[:, 2] > 175).mean() > 0.06:
            continue
        ry, rx = np.nonzero(ring)
        ty, tx = ry + dy, rx + dx
        ok = (ty >= 0) & (ty < H) & (tx >= 0) & (tx < W)
        if ok.sum() < 20:
            continue
        err = np.mean((img[ry[ok], rx[ok], :3] - img[ty[ok], tx[ok], :3]) ** 2)
        if best is None or err < best[0]:
            best = (err, dy, dx)
    if best is None:
        print('fallback inpaint', len(ys))
        out = img.copy()
        m8 = (cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)) * 255).astype(np.uint8)
        out[..., :3] = cv2.inpaint(np.clip(img[..., :3], 0, 255).astype(np.uint8), m8, 8, cv2.INPAINT_TELEA)
        out[..., 3] = np.where(m8 > 0, 255, out[..., 3])
        return out
    _, dy, dx = best
    _, dy, dx = best
    M = np.float32([[1, 0, -dx], [0, 1, -dy]])      # dst(x) = src(x + d)
    srcimg = cv2.warpAffine(np.clip(img[..., :3], 0, 255).astype(np.uint8), M, (W, H), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)
    m8 = (cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)) * 255).astype(np.uint8)
    dst = np.clip(img[..., :3], 0, 255).astype(np.int16)
    diff = np.clip(dst - srcimg.astype(np.int16), -127, 127) + 128
    diff = diff.astype(np.uint8)
    unknown = ((img[..., 3] < 200) | (m8 > 0)).astype(np.uint8) * 255
    bx, by, bw_, bh_ = cv2.boundingRect(m8)
    X0, Y0, X1, Y1 = max(0, bx - 30), max(0, by - 30), min(W, bx + bw_ + 30), min(H, by + bh_ + 30)
    inp_c = cv2.inpaint(diff[Y0:Y1, X0:X1], unknown[Y0:Y1, X0:X1], 6, cv2.INPAINT_TELEA)
    inp = np.zeros_like(diff)
    inp[Y0:Y1, X0:X1] = inp_c
    inp = cv2.GaussianBlur(inp.astype(np.float32) - 128, (0, 0), 1.5)
    res = np.clip(srcimg.astype(np.float32) + inp, 0, 255).astype(np.uint8)
    out = img.copy()
    out[..., :3] = np.where(m8[..., None] > 0, res, out[..., :3])
    out[..., 3] = np.where(m8 > 0, 255, out[..., 3])
    return out


def paste(img, patch_rgba, cx, cy, ang, scale):
    """Alpha-composite an RGBA float patch rotated/scaled around its centre at (cx,cy) of img."""
    ph, pw = patch_rgba.shape[:2]
    M = cv2.getRotationMatrix2D((pw / 2, ph / 2), ang, scale)
    nw, nh = int(pw * scale * 1.5 + 8), int(ph * scale * 1.5 + 8)
    M[0, 2] += nw / 2 - pw / 2
    M[1, 2] += nh / 2 - ph / 2
    prem = patch_rgba.copy()
    prem[..., :3] *= prem[..., 3:4] / 255
    wp = cv2.warpAffine(prem, M, (nw, nh), flags=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    a = wp[..., 3:4] / 255
    rgb = np.where(a > 1e-4, wp[..., :3] / np.maximum(a, 1e-4), 0)
    x0, y0 = int(round(cx - nw / 2)), int(round(cy - nh / 2))
    ys0, xs0 = max(0, y0), max(0, x0)
    ye, xe = min(img.shape[0], y0 + nh), min(img.shape[1], x0 + nw)
    sub = img[ys0:ye, xs0:xe]
    pa = a[ys0 - y0:ye - y0, xs0 - x0:xe - x0]
    pr = rgb[ys0 - y0:ye - y0, xs0 - x0:xe - x0]
    ba = sub[..., 3:4] / 255
    oa = pa + ba * (1 - pa)
    sub[..., :3] = np.where(oa > 1e-4, (pr * pa + sub[..., :3] * ba * (1 - pa)) / np.maximum(oa, 1e-4), 0)
    sub[..., 3:4] = oa * 255
    return img


def cut(poly, box, extra=None, feather=0.8, scale_up=1):
    """RGBA patch from the official art: polygon mask (optionally AND-ed with `extra(crop)`)."""
    x0, y0, x1, y1 = box
    crop = ref[y0:y1, x0:x1].astype(np.float32)
    m = np.zeros(ref.shape[:2], np.uint8)
    cv2.fillPoly(m, [np.array(poly, np.int32)], 255)
    m = m[y0:y1, x0:x1].astype(np.float32) / 255
    if extra is not None:
        m = m * extra(crop)
    m = np.clip(soft(m, feather) * 1.2 - 0.05, 0, 1)
    return np.dstack([crop, m * 255])


# ------------------------------------------------------------------ 1. clean the head layer
hsv = hsv_of(head[..., :3])
a8 = head[..., 3]
white = (hsv[..., 2] > 150) & (hsv[..., 1] < 70) & (a8 > 128) & (xx > 455) & (xx < 548) & (yy > 128) & (yy < 228)
ys, xs = np.nonzero(white)
hull = cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32))
old_clip = np.zeros((H, W), np.uint8)
cv2.fillConvexPoly(old_clip, hull, 1)
old_clip = cv2.dilate(old_clip, np.ones((9, 9), np.uint8))
# bow root remnants (orange pixels) right of the clip
root = np.zeros((H, W), np.uint8)
cv2.fillPoly(root, [np.array([(505, 150), (548, 150), (585, 214), (590, 270), (520, 272), (512, 215)], np.int32)], 1)
orange = (hsv[..., 1] > 120) & (hsv[..., 0] >= 4) & (hsv[..., 0] <= 24) & (hsv[..., 2] > 120)
holepoly = np.zeros((H, W), np.uint8)
cv2.fillPoly(holepoly, [np.array([(508, 222), (548, 222), (552, 266), (512, 266)], np.int32)], 1)
rem = (((root > 0) & orange & (a8 > 60)) | ((holepoly > 0) & (a8 < 200))).astype(np.uint8)
rem = cv2.dilate(rem, np.ones((5, 5), np.uint8))
# old hair bars (orange, left)
bars_old = np.zeros((H, W), np.uint8)
cv2.line(bars_old, (114, 150), (170, 193), 1, 26)
cv2.line(bars_old, (106, 181), (161, 222), 1, 26)

AVOID = cv2.dilate(((old_clip > 0) | (rem > 0) | (bars_old > 0)).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
shifts = [(dy, dx) for dy in range(-120, -40, 5) for dx in range(-90, 20, 5)]
head2 = hair_fill(head, old_clip, shifts)
head2 = hair_fill(head2, rem, shifts)
head2 = hair_fill(head2, bars_old, [(dy, dx) for dy in range(40, 110, 6) for dx in range(-14, 15, 4)] + [(dy, dx) for dy in range(-90, -30, 6) for dx in range(-14, 15, 4)])
# hair silhouette where the old bow used to sit: close the gap with a smooth diagonal edge
sil = np.zeros((H, W), np.uint8)
cv2.fillPoly(sil, [np.array([(536, 150), (551, 160), (560, 185), (570, 212), (578, 232), (585, 256), (592, 276), (536, 276)], np.int32)], 1)
gap = ((sil > 0) & (head2[..., 3] < 200)).astype(np.uint8)
gap = cv2.dilate(gap, np.ones((3, 3), np.uint8))
tmp = head2.copy()
tmp[..., 3] = np.where(gap > 0, 255, tmp[..., 3])
AVOID = None
filled = hair_fill(tmp, gap, [(dy, dx) for dy in range(-40, 41, 8) for dx in range(-110, -44, 6)])
sa = soft(sil, 1.2)
head2[..., :3] = np.where(gap[..., None] > 0, filled[..., :3], head2[..., :3])
head2[..., 3] = np.where(gap > 0, np.maximum(head2[..., 3], sa * 255), head2[..., 3])

# ------------------------------------------------------------------ 2. official hair clip
clip_poly = [(883, 250), (900, 246), (917, 243), (921, 232), (924, 220), (930, 211), (940, 206), (948, 211), (953, 222), (955, 238), (957, 252), (960, 262), (965, 274), (971, 288), (974, 303), (975, 320), (973, 334), (967, 344), (956, 349), (935, 352), (905, 355), (873, 357), (862, 346), (859, 330), (863, 312), (870, 288), (877, 263)]
clip = cut(clip_poly, (840, 190, 1000, 375))
CLIP_RIG = (574.0, 190.0)          # centre (rig px)
CLIP_W_RIG = 38.0                  # plate width (rig px) = ~0.36 x eye distance (official proportion)
plate_w_ref = 975 - 859
clip_scale = (CLIP_W_RIG / HS) / plate_w_ref
clip_canvas = np.zeros((int(clip.shape[0] * clip_scale * 1.6) + 8, int(clip.shape[1] * clip_scale * 1.6) + 8, 4), np.float32)
clip_canvas = paste(clip_canvas, clip, clip_canvas.shape[1] / 2, clip_canvas.shape[0] / 2, 10.0, clip_scale)   # ccw: leave only a slight official tilt
al_ = clip_canvas[..., 3]
ys_, xs_ = np.nonzero(al_ > 3)
cx0, cy0, cx1, cy1 = xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1
clip_img = clip_canvas[cy0:cy1, cx0:cx1]
clip_off = (CLIP_RIG[0] - (clip_img.shape[1] / 2) * HS, CLIP_RIG[1] - (clip_img.shape[0] / 2) * HS)

# ------------------------------------------------------------------ 3. official hair bands
def orange_only(crop):
    h = cv2.cvtColor(crop.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    o = ((h[..., 0] >= 4) & (h[..., 0] <= 24) & (h[..., 1] > 70) & (h[..., 2] > 110)).astype(np.uint8)
    o = cv2.morphologyEx(o, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return cv2.dilate(o, np.ones((5, 5), np.uint8)).astype(np.float32)
bands = cut([(255, 285), (385, 285), (385, 395), (255, 395)], (250, 280, 390, 400), extra=orange_only, feather=0.7)
BAR_RIG = (355.0, 193.0)
bcx, bcy = (BAR_RIG[0] - HO[0]) / HS, (BAR_RIG[1] - HO[1]) / HS
head2 = paste(head2, bands, bcx, bcy, 10.0, (36.0 / HS) / 125.0)

# ------------------------------------------------------------------ 4. earring (right ear)
def ear_extra(crop):
    h = cv2.cvtColor(crop.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    o = ((h[..., 0] >= 4) & (h[..., 0] <= 26) & (h[..., 1] > 100) & (h[..., 2] > 140))
    g = (h[..., 1] < 60) & (h[..., 2] > 100) & (np.arange(h.shape[0])[:, None] < 38)
    return cv2.dilate((o | g).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
ear = cut([(972, 604), (996, 604), (1004, 646), (990, 676), (970, 676), (960, 646)], (950, 596, 1015, 684), extra=ear_extra, feather=0.6)
EAR_RIG = (593.0, 281.0)           # right earlobe; the earring hangs from here (top of the patch)
EAR_SC = (24.0 / HS) / 52.0
ear_canvas = np.zeros((int(ear.shape[0] * EAR_SC * 1.5) + 8, int(ear.shape[1] * EAR_SC * 1.5) + 8, 4), np.float32)
ear_canvas = paste(ear_canvas, ear, ear_canvas.shape[1] / 2, ear_canvas.shape[0] / 2, 0.0, EAR_SC)
ys_, xs_ = np.nonzero(ear_canvas[..., 3] > 3)
ear_img = ear_canvas[ys_.min():ys_.max() + 1, xs_.min():xs_.max() + 1]
ear_off = (EAR_RIG[0] - (ear_img.shape[1] / 2) * HS, EAR_RIG[1] - 3 * HS)

# ------------------------------------------------------------------ 5. choker: buckle + two-star charm (body layer)
def silver_or_orange(crop):
    h = cv2.cvtColor(crop.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    o = ((h[..., 0] >= 4) & (h[..., 0] <= 26) & (h[..., 1] > 90) & (h[..., 2] > 140))
    return cv2.dilate(o.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
charm = cut([(735, 925), (800, 925), (800, 1068), (735, 1068)], (730, 915, 806, 1072), extra=silver_or_orange, feather=0.6)
buckle_poly = [(762, 908), (790, 908), (815, 912), (820, 940), (820, 975), (800, 992), (770, 992), (758, 960), (758, 925)]
def silver_only(crop):
    h = cv2.cvtColor(crop.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    return ((h[..., 1] < 70) & (h[..., 2] > 105)).astype(np.float32)
buckle = cut(buckle_poly, (750, 900, 830, 1000), extra=lambda c: cv2.dilate(silver_only(c), np.ones((3, 3), np.uint8)), feather=0.6)
# clear the old charm in the body layer then paste
bh, bw = body.shape[:2]
byy, bxx = np.mgrid[0:bh, 0:bw]
bhsv = hsv_of(body[..., :3])
oldcharm = ((bhsv[..., 1] > 110) & (bhsv[..., 0] >= 4) & (bhsv[..., 0] <= 26) & (bxx > 392) & (bxx < 428) & (byy > 104) & (byy < 168)).astype(np.uint8)
oldcharm = cv2.dilate(oldcharm, np.ones((5, 5), np.uint8))
body2 = cv2.inpaint(np.clip(body[..., :3], 0, 255).astype(np.uint8), (oldcharm * 255).astype(np.uint8), 4, cv2.INPAINT_TELEA).astype(np.float32)
body2 = np.dstack([np.where(oldcharm[..., None] > 0, body2, body[..., :3]), body[..., 3]])
CH_SC = 0.36
body2 = paste(body2, buckle, 418, 117, 0.0, CH_SC)
body2 = paste(body2, charm, 410, 118 + (1068 - 925) * CH_SC / 2 - 4, 0.0, CH_SC)

# ------------------------------------------------------------------ 6. official bow -> ribbon layer
bow_poly = [(1068, 336), (1085, 330), (1100, 340), (1112, 356), (1135, 356), (1170, 358), (1205, 362), (1237, 374), (1248, 382), (1249, 405), (1245, 440), (1237, 478), (1225, 503), (1216, 511), (1195, 498), (1168, 475), (1143, 448), (1128, 422), (1120, 405), (1113, 428), (1106, 446), (1096, 452), (1082, 432), (1070, 396), (1064, 362)]
bow = cut(bow_poly, (1040, 310, 1262, 530), feather=0.9)
KNOT_REF = (1113 - 1040, 358 - 310)
KNOT_RIG = (626.0, 213.0)
bow_scale = (38.0 / 116.0) / HS     # rig px per ref px / layer scale
bw_, bh_ = bow.shape[1], bow.shape[0]
ribbon_img = np.zeros((int(bh_ * bow_scale) + 4, int(bw_ * bow_scale) + 4, 4), np.float32)
ribbon_img = paste(ribbon_img, bow, bw_ * bow_scale / 2 + 2, bh_ * bow_scale / 2 + 2, 0.0, bow_scale)
# bbox crop
al = ribbon_img[..., 3]
ys_, xs_ = np.nonzero(al > 3)
rx0, ry0, rx1, ry1 = xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1
ribbon_img = ribbon_img[ry0:ry1, rx0:rx1]
knot_px = (KNOT_REF[0] * bow_scale + 2 - rx0, KNOT_REF[1] * bow_scale + 2 - ry0)
rib_off = (KNOT_RIG[0] - knot_px[0] * HS, KNOT_RIG[1] - knot_px[1] * HS)


# the old bars' right tips were part of the fringe layer: drop them (hair below is already repainted)
bangs = np.array(Image.open(SRC + 'bangs.png').convert('RGBA')).astype(np.float32)
bhsv_ = hsv_of(bangs[..., :3])
byy_, bxx_ = np.mgrid[0:bangs.shape[0], 0:bangs.shape[1]]
tip = ((bhsv_[..., 1] > 90) & (bhsv_[..., 0] >= 4) & (bhsv_[..., 0] <= 26) & (bxx_ < 60) & (byy_ > 50) & (byy_ < 170)).astype(np.uint8)
tip = cv2.dilate(tip, np.ones((9, 9), np.uint8))
bangs[..., 3] = np.where(tip > 0, 0, bangs[..., 3])


def save(arr, name):
    a = np.clip(arr, 0, 255).astype(np.uint8)
    a[..., 3][a[..., 3] < 3] = 0
    a[a[..., 3] == 0, :3] = 0
    Image.fromarray(a, 'RGBA').save(OUT + name + '.png', optimize=True)


save(head2, 'head')
save(bangs, 'bangs')
save(ear_img, 'earring')
save(np.dstack([body2[..., :3], body[..., 3]]) if body2.shape[-1] == 3 else body2, 'body')
save(ribbon_img, 'ribbon')
save(clip_img, 'clip')
man = json.load(open(SRC + 'manifest.json'))
rig = man['rig']
rig['layers']['earring'] = [round(ear_off[0], 2), round(ear_off[1], 2), HS]
rig['layers']['clip'] = [round(clip_off[0], 2), round(clip_off[1], 2), HS]
rig['layers']['ribbon'] = [round(rib_off[0], 2), round(rib_off[1], 2), HS]
rig['anchors']['ribbon'] = [KNOT_RIG[0], KNOT_RIG[1]]
json.dump(man, open(OUT + 'manifest.json', 'w'), indent=2)
print('ribbon offset', rib_off, ribbon_img.shape)
