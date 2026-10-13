"""Stage 3: split the torso into swingable parts (sleeves on shoulder pivots, badge, strap).
Hidden areas under each part are inpainted from the torso so small rotations never show holes."""
import json, sys
import numpy as np, cv2
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/'
rig = json.load(open(OUT + 'rig.json'))
bo = rig['layers']['body']; ox, oy = int(bo[0]), int(bo[1])
barr = np.asarray(Image.open(OUT + 'body.png').convert('RGBA')).astype(np.float32)
H, W = barr.shape[:2]
PARTS = {  # rig-space polygons, pivot
    'arm-l': ([(305, 440), (250, 452), (200, 520), (150, 700), (110, 850), (40, 1120), (240, 1120), (232, 900), (228, 800), (245, 620), (300, 520), (332, 468)], (300, 470)),
    'arm-r': ([(640, 440), (700, 452), (748, 520), (800, 700), (845, 850), (920, 1120), (722, 1120), (716, 900), (708, 800), (692, 620), (650, 520), (622, 468)], (652, 474)),
    'badge': ([(366, 850), (397, 850), (400, 962), (400, 1112), (323, 1112), (323, 962), (364, 958)], (381, 852)),
    'strap-r': ([(653, 596), (687, 596), (690, 848), (658, 848)], (669, 598)),
}
def poly_mask(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array([(x - ox, y - oy) for x, y in pts], np.int32)], 1)
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.7)
# drop floating wisps (old hair fragments) that are not attached to the body
nb, lb, st, _ = cv2.connectedComponentsWithStats((barr[..., 3] > 6).astype(np.uint8), connectivity=8)
big = 1 + int(np.argmax(st[1:, 4]))
barr[..., 3] *= cv2.GaussianBlur((lb == big).astype(np.float32), (0, 0), 0.6) > 0.02
# around the neck only the orange hood / choker belongs to the body (old hair strands go)
yy0, xx0 = np.mgrid[0:H, 0:W]
hsv0 = cv2.cvtColor(np.clip(barr[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
orange0 = (hsv0[..., 0] > 4) & (hsv0[..., 0] < 24) & (hsv0[..., 1] > 100) & (hsv0[..., 2] > 110)
zone0 = (yy0 + oy < 414) & (np.abs(xx0 + ox - 474) > 42)
orange0 = cv2.morphologyEx(orange0.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
barr[..., 3] *= ~(zone0 & ~orange0)
alpha = barr[..., 3] / 255
rgb = np.clip(barr[..., :3], 0, 255).astype(np.uint8)
fill = np.zeros((H, W), np.uint8)
for name, (pts, piv) in PARTS.items():
    pm = poly_mask(pts)
    part = np.dstack([barr[..., :3], alpha * pm * 255]).astype(np.uint8)
    part[part[..., 3] < 3] = 0
    im = Image.fromarray(part, 'RGBA'); bb = im.getbbox()
    im.crop(bb).save(OUT + name + '.png', optimize=True)
    rig['layers'][name] = [ox + bb[0], oy + bb[1]]
    rig.setdefault('pivots', {})[name] = list(piv)
    hard = pm > 0.5
    if name.startswith('arm'):  # only the inner band next to the jacket can be revealed
        rest = (alpha > 0.5) & ~hard
        band = hard & (cv2.dilate(rest.astype(np.uint8), np.ones((31, 31), np.uint8)) > 0)
        fill |= (band & (alpha > 0.5)).astype(np.uint8)
    else:
        fill |= cv2.dilate((hard & (alpha > 0.05)).astype(np.uint8), np.ones((5, 5), np.uint8))
# torso underneath: inpaint the hidden areas from surrounding torso pixels
src = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
filled = cv2.cvtColor(cv2.inpaint(src, fill * 255, 9, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
f = cv2.GaussianBlur(fill.astype(np.float32), (0, 0), 1.2)[..., None]
out = rgb * (1 - f) + filled * f
# neck backing (v7): clear the old stage-1 pale rectangle; polish_neck rebuilds the join.
yy, xx = np.mgrid[0:H, 0:W]; ry, rx = yy + oy, xx + ox
bl = out @ np.array([.299, .587, .114])
chsv = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
old_rect = (ry >= 300) & (ry < 396) & (np.abs(rx - 474) < 40) & (bl > 200) & (chsv[..., 1] < 55)
choker = (ry >= 392) & (bl < 95) & (alpha > 0.7) & (np.abs(rx - 474) < 42)
clear = old_rect & ~choker
out = np.where(clear[..., None], 0, out)
a2 = np.where(clear, 0.0, alpha)
nc = np.array([200., 150., 128.])  # placeholder for log
torso = np.dstack([np.clip(out, 0, 255), a2 * 255]).astype(np.uint8)
Image.fromarray(torso, 'RGBA').save(OUT + 'body.png', optimize=True)
json.dump(rig, open(OUT + 'rig.json', 'w'), indent=1)
print('parts', {k: rig['layers'][k] for k in PARTS}, 'neck', nc)
