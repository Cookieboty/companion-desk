"""v7 neck–collar join polish. Run after body_parts.

Prefer real HD neck (head owns jaw→choker). Body keeps a thin chest-cloned backup
strip and fills jaw-corner gaps from collar orange / chest skin. Harden hair tips.
No tall rectangle pad, no heavy gaussian fade.
"""
import json, sys
import numpy as np, cv2
from PIL import Image

OUT = (sys.argv[1].rstrip('/') + '/') if len(sys.argv) > 1 else 'out/'
SRC = sys.argv[2] if len(sys.argv) > 2 else '/workspace/brand/nomi-hd/nomi-head-front-hd.jpg'
rig = json.load(open(OUT + 'rig.json'))
L = rig['layers']
K = 0.66
SRC_CHIN = (640.0, 470.0)
RIG_CHIN = (474.0, 381.0)


def harden_bottom(path, off, y0_frac=0.45, y_lo=350, y_hi=450):
    native = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    k = off[2] if len(off) > 2 else 1.0
    h, w = native.shape[:2]
    if abs(k - 1) > 1e-3:
        sh, sw = max(1, int(round(h * k))), max(1, int(round(w * k)))
        im = cv2.resize(native, (sw, sh), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR)
    else:
        im = native.copy()
    ox, oy = float(off[0]), float(off[1])
    yy, xx = np.mgrid[0:im.shape[0], 0:im.shape[1]]
    ry = yy + oy
    a = im[..., 3]
    rgb = im[..., :3]
    lum = rgb @ np.array([.299, .587, .114])
    hsv = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    near = (ry > y_lo) & (ry < y_hi)
    fringe = near & (a > 5) & (a < 210) & (lum > 150)
    dark = near & (hsv[..., 1] > 55) & (a > 180) & (lum < 140)
    ref = np.median(rgb[dark], axis=0) if dark.sum() > 10 else np.array([70., 45., 35.])
    im[fringe, :3] = ref
    im[fringe, 3] = np.maximum(im[fringe, 3], 245)
    tips = near & (hsv[..., 1] > 48) & (lum < 190) & (a > 25)
    im[tips, 3] = np.maximum(im[tips, 3], 252)
    ghost = near & (a > 0) & (a < 100) & (lum > 195)
    im[ghost, 3] = 0
    if abs(k - 1) > 1e-3:
        back = cv2.resize(im, (w, h), interpolation=cv2.INTER_LINEAR)
        cut = int(h * y0_frac)
        native[cut:] = back[cut:]
    else:
        native = im
    Image.fromarray(np.clip(native, 0, 255).astype(np.uint8), 'RGBA').save(path, optimize=True)


body = np.asarray(Image.open(OUT + 'body.png').convert('RGBA')).astype(np.float32)
bo = L['body']
yy, xx = np.mgrid[0:body.shape[0], 0:body.shape[1]]
ry, rx = yy + bo[1], xx + bo[0]
ba = body[..., 3]
brgb = body[..., :3]
bl = brgb @ np.array([.299, .587, .114])
bhsv = cv2.cvtColor(np.clip(brgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)

chest = (ry > 414) & (ry < 458) & (np.abs(rx - 474) < 40) & (ba > 200)
chest &= (bhsv[..., 0] < 28) & (bhsv[..., 1] > 20) & (bhsv[..., 2] > 110)
nc = np.percentile(brgb[chest], 55, axis=0) if chest.sum() > 30 else np.array([190., 140., 115.])
if chest.sum() > 80:
    ys_c, xs_c = np.where(chest)
    donor = brgb[int(ys_c.min()):int(ys_c.max()) + 1, int(xs_c.min()):int(xs_c.max()) + 1].copy()
else:
    donor = None

choker = (ry >= 392) & (ry <= 414) & (np.abs(rx - 474) < 52) & (bl < 110) & (ba > 140)
pale = (np.abs(rx - 474) < 48) & (ry >= 300) & (ry < 396) & (bl > 190) & (bhsv[..., 1] < 60) & (ba > 5)
wipe = pale & ~choker
brgb = np.where(wipe[..., None], 0, brgb)
ba = np.where(wipe, 0.0, ba)

# thin tapered backup strip
jaw_y, choker_y = 384.0, 396.0
t = np.clip((ry - jaw_y) / max(1.0, choker_y - jaw_y), 0, 1)
half_w = 34.0 - 4.0 * t
top_edge = jaw_y + 3.5 * (1.0 - ((rx - 474.0) / 32.0) ** 2).clip(0, 1)
neck = (np.abs(rx - 474) < half_w) & (ry >= top_edge) & (ry < choker_y) & ~choker
neck &= (rx > 435) & (rx < 515)
if donor is not None and donor.size > 0:
    dh, dw = donor.shape[:2]
    ny = np.clip((ry - jaw_y) / max(1.0, choker_y - jaw_y), 0, 1)
    nx = np.clip((rx - (474 - 36)) / 72.0, 0, 1)
    sy = np.clip((ny * (dh - 1)).astype(np.int32), 0, dh - 1)
    sx = np.clip((nx * (dw - 1)).astype(np.int32), 0, dw - 1)
    cloned = donor[sy, sx]
else:
    cloned = np.broadcast_to(nc, brgb.shape)
chin_shadow = 0.78 + 0.22 * np.clip((ry - top_edge) / 8.0, 0, 1)
side_shade = 1.0 - 0.07 * np.clip(np.abs(rx - 474) / 36.0, 0, 1)
collar_dark = 1.0 - 0.08 * np.clip((ry - (choker_y - 5)) / 5.0, 0, 1)
shade = (chin_shadow * side_shade * collar_dark)[..., None]
filled = np.clip(cloned * shade, 0, 255)
need = neck & ((ba < 40) | ((bl > 185) & (bhsv[..., 1] < 55)))
brgb = np.where(need[..., None], filled, brgb)
ba = np.where(need, 255.0, ba)

# jaw-corner gaps: skin near column, orange farther out
orange = (bhsv[..., 0] > 3) & (bhsv[..., 0] < 26) & (bhsv[..., 1] > 70) & (bhsv[..., 2] > 80) & (ba > 170)
side_zone = (ry > 400) & (ry < 460) & (((rx > 390) & (rx < 455)) | ((rx > 495) & (rx < 560)))
oc = np.median(brgb[orange & side_zone], axis=0) if (orange & side_zone).sum() > 15 else np.array([170., 100., 60.])
right_gap = (rx >= 500) & (rx <= 542) & (ry >= 362) & (ry <= 412) & (ba < 60) & ~choker
left_gap = (rx >= 408) & (rx <= 448) & (ry >= 362) & (ry <= 412) & (ba < 60) & ~choker
use_skin = (right_gap & (rx < 512)) | (left_gap & (rx > 430))
use_orange = (right_gap & (rx >= 512)) | (left_gap & (rx <= 430))
vshade = 0.88 + 0.12 * np.clip((412 - ry) / 30.0, 0, 1)
brgb = np.where(use_skin[..., None], np.clip(nc * vshade[..., None] * 0.92, 0, 255), brgb)
ba = np.where(use_skin, 255.0, ba)
brgb = np.where(use_orange[..., None], np.clip(oc * vshade[..., None], 0, 255), brgb)
ba = np.where(use_orange, 255.0, ba)

# kill orange/dark flecks inside neck column
inside_neck = (np.abs(rx - 474) < 38) & (ry >= 365) & (ry < 396) & (ba > 100)
orangeish = (bhsv[..., 0] > 3) & (bhsv[..., 0] < 28) & (bhsv[..., 1] > 70) & (bhsv[..., 2] > 70)
# refresh hsv after writes
bhsv = cv2.cvtColor(np.clip(brgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
bl = brgb @ np.array([.299, .587, .114])
orangeish = (bhsv[..., 0] > 3) & (bhsv[..., 0] < 28) & (bhsv[..., 1] > 70) & (bhsv[..., 2] > 70)
dark_fleck = inside_neck & (bl < 90) & (bhsv[..., 1] > 40) & (ry < 392)
fix = (inside_neck & orangeish) | dark_fleck
ishade = 0.85 + 0.15 * np.clip((ry - 365) / 25.0, 0, 1)
brgb = np.where(fix[..., None], np.clip(nc * ishade[..., None], 0, 255), brgb)
ba = np.where(fix, 255.0, ba)

collar_band = (ry >= 388) & (ry <= 416) & (np.abs(rx - 474) < 95) & (ba > 20)
wfringe = collar_band & (bl > 205) & (bhsv[..., 1] < 45) & (ba < 230)
ba = np.where(wfringe, 0.0, ba)
semi = collar_band & (ba > 40) & (ba < 230) & (bl < 170)
ba = np.where(semi, 255.0, ba)

# Harmonise any remaining body neck skin to lit chest tone
bhsv = cv2.cvtColor(np.clip(brgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
bl = brgb @ np.array([.299, .587, .114])
bn = (np.abs(rx - 474) < 40) & (ry >= 370) & (ry < 396) & (ba > 150) & ~choker
bn &= (bhsv[..., 0] < 30) & (bl > 120)
if bn.any():
    local = brgb[bn]
    mean = local.mean(axis=0)
    rel = local / (mean + 1e-3)
    brgb[bn] = np.clip(nc * rel, 0, 255)

body[..., :3] = brgb
body[..., 3] = ba
Image.fromarray(np.clip(body, 0, 255).astype(np.uint8), 'RGBA').save(OUT + 'body.png', optimize=True)

# head
src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
sH, sW = src.shape[:2]
head = np.asarray(Image.open(OUT + 'head.png').convert('RGBA')).astype(np.float32)
hoff = L['head']; hk = hoff[2] if len(hoff) > 2 else 1.0
bb0 = (hoff[0] - RIG_CHIN[0]) / K + SRC_CHIN[0]
bb1 = (hoff[1] - RIG_CHIN[1]) / K + SRC_CHIN[1]
Hh, Wh = head.shape[:2]
yy, xx = np.mgrid[0:Hh, 0:Wh]
sx = np.clip((bb0 + xx).astype(np.int32), 0, sW - 1)
sy = np.clip((bb1 + yy).astype(np.int32), 0, sH - 1)
rx = hoff[0] + xx * hk
ry = hoff[1] + yy * hk
slum = src @ np.array([.299, .587, .114])
shsv = cv2.cvtColor(src.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hair = (shsv[..., 1] > 45) & (slum < 200)
skin = (shsv[..., 0] < 28) & (shsv[..., 1] >= 14) & (slum > 100)

zone = (((rx > 405) & (rx < 470)) | ((rx > 478) & (rx < 555))) & (ry > 340) & (ry < 425)
empty = zone & (head[..., 3] < 90)
restore_hair = empty & hair[sy, sx]
restore_skin = empty & skin[sy, sx] & (np.abs(rx - 474) < 52)
head[restore_hair, :3] = src[sy[restore_hair], sx[restore_hair]]
head[restore_hair, 3] = 255
head[restore_skin, :3] = src[sy[restore_skin], sx[restore_skin]]
head[restore_skin, 3] = 255

hhsv = cv2.cvtColor(np.clip(head[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hlum = head[..., :3] @ np.array([.299, .587, .114])
jacket = (ry > 355) & (ry < 425) & (np.abs(rx - 474) > 32) & (
    (hhsv[..., 0] > 2) & (hhsv[..., 0] < 28) & (hhsv[..., 1] > 75) & (hlum < 215)
)
jacket &= ~((hhsv[..., 1] > 50) & (hlum < 155))
jacket &= ~(skin[sy, sx] & (np.abs(rx - 474) < 50))
head[jacket, 3] = 0
head[jacket, :3] = 0

# clean orange inside neck column on head
hhsv = cv2.cvtColor(np.clip(head[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hlum = head[..., :3] @ np.array([.299, .587, .114])
inside = (np.abs(rx - 474) < 36) & (ry > 360) & (ry < 405) & (head[..., 3] > 100)
orange = (hhsv[..., 0] > 3) & (hhsv[..., 0] < 26) & (hhsv[..., 1] > 85) & (hlum < 210)
hair_px = (hhsv[..., 1] > 55) & (hlum < 160)
bad = inside & orange & ~hair_px
skin_zone = (np.abs(rx - 474) < 28) & (ry > 375) & (ry < 400) & (head[..., 3] > 200) & (hhsv[..., 1] < 70) & (hlum > 130)
sc = np.median(head[skin_zone, :3], axis=0) if skin_zone.sum() > 20 else nc
head[bad, :3] = sc
head[bad, 3] = 255

neck_px = (np.abs(rx - 474) < 46) & (ry > 348) & (ry < 412) & (head[..., 3] > 160) & skin[sy, sx]
if neck_px.any() and chest.sum() > 30:
    # Remap mean to lit chest tone while keeping local shading (stronger than gain-only)
    local = head[neck_px, :3]
    mean = local.mean(axis=0)
    rel = local / (mean + 1e-3)
    remapped = np.clip(nc * rel, 0, 255)
    head[neck_px, :3] = local * 0.30 + remapped * 0.70

chin_zone = (np.abs(rx - 474) < 34) & (ry > 368) & (ry < 392) & (head[..., 3] > 180) & skin[sy, sx]
mid_neck = (np.abs(rx - 474) < 20) & (ry > 392) & (ry < 405) & (head[..., 3] > 180) & skin[sy, sx]
if chin_zone.any() and mid_neck.any():
    chin_lum = (head[chin_zone, :3] @ np.array([.299, .587, .114])).mean()
    mid_lum = (head[mid_neck, :3] @ np.array([.299, .587, .114])).mean()
    if chin_lum > mid_lum - 5:
        chin_w = np.exp(-0.5 * ((rx - 474) / 16.0) ** 2) * np.exp(-0.5 * ((ry - 380) / 7.0) ** 2)
        chin_w = chin_w * chin_zone.astype(np.float32)
        head[..., :3] = head[..., :3] * (1.0 - 0.16 * chin_w[..., None]) + np.array([135., 92., 72.]) * (0.16 * chin_w[..., None])

tips = (ry > 355) & (ry < 425) & (hhsv[..., 1] > 45) & (hlum < 185) & (head[..., 3] > 20)
# refresh
hhsv = cv2.cvtColor(np.clip(head[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hlum = head[..., :3] @ np.array([.299, .587, .114])
tips = (ry > 355) & (ry < 425) & (hhsv[..., 1] > 45) & (hlum < 185) & (head[..., 3] > 20)
head[tips, 3] = np.maximum(head[tips, 3], 250)
ghost = (ry > 355) & (ry < 425) & (head[..., 3] > 0) & (head[..., 3] < 110) & (hlum > 195)
head[ghost, 3] = 0

Image.fromarray(np.clip(head, 0, 255).astype(np.uint8), 'RGBA').save(OUT + 'head.png', optimize=True)
harden_bottom(OUT + 'head.png', L['head'], 0.50, 340, 455)
for n in ['hair-side-l', 'hair-side-r']:
    if n in L:
        harden_bottom(OUT + n + '.png', L[n], 0.30, 340, 460)

print('polish_neck_v7', 'chest', nc.round().tolist(),
      'restored_hair', int(restore_hair.sum()), 'restored_skin', int(restore_skin.sum()),
      'backup_neck', int(need.sum()), 'corner_skin', int(use_skin.sum()), 'corner_orange', int(use_orange.sum()))
