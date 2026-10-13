"""Crisp neck–collar join polish (v6). Run after body_parts.

Restores collar-adjacent hair from the HD source into transparent gaps, hardens
hair-tip alpha, and rebuilds a short colour-matched under-jaw neck pad on the body.
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

def harden_bottom(path, off, y0_frac=0.45):
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
    near = (ry > 350) & (ry < 430)
    fringe = near & (a > 5) & (a < 200) & (lum > 150)
    dark = near & (hsv[..., 1] > 55) & (a > 180) & (lum < 140)
    ref = np.median(rgb[dark], axis=0) if dark.sum() > 10 else np.array([70., 45., 35.])
    im[fringe, :3] = ref
    im[fringe, 3] = np.maximum(im[fringe, 3], 230)
    tips = near & (hsv[..., 1] > 55) & (lum < 180) & (a > 40)
    im[tips, 3] = np.maximum(im[tips, 3], 245)
    ghost = near & (a > 0) & (a < 100) & (lum > 200)
    im[ghost, 3] = 0
    if abs(k - 1) > 1e-3:
        back = cv2.resize(im, (w, h), interpolation=cv2.INTER_LINEAR)
        cut = int(h * y0_frac)
        native[cut:] = back[cut:]
    else:
        native = im
    Image.fromarray(np.clip(native, 0, 255).astype(np.uint8), 'RGBA').save(path, optimize=True)

# --- restore collar-adjacent hair/skin gaps on the head from the HD source ---
src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
sH, sW = src.shape[:2]
head = np.asarray(Image.open(OUT + 'head.png').convert('RGBA')).astype(np.float32)
hoff = L['head']; hk = hoff[2]
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
hair = (shsv[..., 1] > 55) & (slum < 185)
skin = (shsv[..., 0] < 25) & (shsv[..., 1] >= 18) & (slum > 130)
# broad gap zone beside the neck column down to the collar
gap = (((rx > 420) & (rx < 462)) | ((rx > 486) & (rx < 540))) & (ry > 345) & (ry < 415)
empty = gap & (head[..., 3] < 50)
restore_hair = empty & hair[sy, sx]
restore_skin = empty & skin[sy, sx] & (np.abs(rx - 474) < 44)
head[restore_hair, :3] = src[sy[restore_hair], sx[restore_hair]]
head[restore_hair, 3] = 255
head[restore_skin, :3] = src[sy[restore_skin], sx[restore_skin]]
head[restore_skin, 3] = 255
Image.fromarray(np.clip(head, 0, 255).astype(np.uint8), 'RGBA').save(OUT + 'head.png', optimize=True)

# --- body under-jaw pad + crisp collar ---
body = np.asarray(Image.open(OUT + 'body.png').convert('RGBA')).astype(np.float32)
bo = L['body']
yy, xx = np.mgrid[0:body.shape[0], 0:body.shape[1]]
ry, rx = yy + bo[1], xx + bo[0]
ba = body[..., 3]
brgb = body[..., :3]
bl = brgb @ np.array([.299, .587, .114])
bhsv = cv2.cvtColor(np.clip(brgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
chest = (ry > 412) & (ry < 450) & (np.abs(rx - 474) < 34) & (ba > 200)
chest &= (bhsv[..., 0] < 25) & (bhsv[..., 1] > 18) & (bhsv[..., 2] > 130)
nc = np.median(brgb[chest], axis=0) if chest.sum() > 30 else np.array([232., 178., 154.])
half_w = 16 + 18 * np.clip((ry - 375) / 22.0, 0, 1)
neck = (np.abs(rx - 474) < half_w) & (ry >= 375) & (ry < 397)
choker = (ry >= 393) & (bl < 95) & (ba > 180) & (np.abs(rx - 474) < 45)
neck &= ~choker
pale = (np.abs(rx - 474) < 40) & (ry >= 310) & (ry < 390) & (bl > 205) & (bhsv[..., 1] < 50) & (ba > 10)
body[pale & (ry < 375), 3] = 0
body[pale & (ry < 375), :3] = 0
t = np.clip((ry - 375) / 20.0, 0, 1)
shade = 0.80 + 0.20 * np.sin(np.clip(t, 0, 1) * np.pi) - 0.04 * np.clip((t - 0.85) / 0.15, 0, 1)
body[neck, :3] = nc * shade[neck, None]
body[neck, 3] = 255
collar_band = (ry >= 390) & (ry <= 410) & (np.abs(rx - 474) < 80) & (ba > 30)
semi = collar_band & (ba > 40) & (ba < 230)
body[semi, 3] = 255
wfringe = collar_band & (bl > 210) & (bhsv[..., 1] < 40) & (ba < 200)
body[wfringe, 3] = 0
Image.fromarray(np.clip(body, 0, 255).astype(np.uint8), 'RGBA').save(OUT + 'body.png', optimize=True)

harden_bottom(OUT + 'head.png', L['head'], 0.55)
for n in ['hair-side-l', 'hair-side-r']:
    if n in L:
        harden_bottom(OUT + n + '.png', L[n], 0.4)
print('polish_neck', 'nc', nc.round().tolist(), 'restored_hair', int(restore_hair.sum()), 'restored_skin', int(restore_skin.sum()))
