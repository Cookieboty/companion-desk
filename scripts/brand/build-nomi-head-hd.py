#!/usr/bin/env python3
"""Stage 2 (v4): rebuild the whole Nomi head from the owner's front-facing HD head image.

Local only (numpy, Pillow, opencv-python-headless). Usage:
  python3 scripts/brand/build-nomi-head-hd.py <nomi-head-front-hd.jpg> <rig-out-dir/>
Needs <rig-out-dir>/rig.json + body.png from stage 1 (build-nomi-rig.py). Replaces the
head-related layers (head, bangs, side hair, ribbon, eyes, mouths) with layers cut from the
one HD source, stored at native resolution with a draw scale, and updates rig.json.
v4: the eye sockets are filled with clean skin and eye metrics + lash colour are written to
rig.json; the renderer draws the descending lid, closed and happy (^^) eyes procedurally.
Then run stage 3 (build-nomi-body-parts.py).

v5: eye opening fitted to the lash lower edge; lash layer limited to the eye
border ring (pixel-aligned); eye region inpainted out of head and bangs.

v6: crisp neck column + opaque collar-adjacent hair tips; closed/happy lids
improved in the renderer (thicker taper, crease, lid shade, lower-lash hint).
"""
import sys, json, math
import numpy as np, cv2
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'nomi-head-front-hd.jpg'
OUT = (sys.argv[2].rstrip('/') + '/') if len(sys.argv) > 2 else 'out/'
rig = json.load(open(OUT + 'rig.json'))
img = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W = img.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
# --- placement: source px -> rig px (uniform scale, chin onto the body's neck)
K = 0.66                       # head width/chin-to-eyes matched to the half-body rig
SRC_CHIN = (640.0, 470.0); RIG_CHIN = (474.0, 381.0)
def to_rig(x, y): return [RIG_CHIN[0] + (x - SRC_CHIN[0]) * K, RIG_CHIN[1] + (y - SRC_CHIN[1]) * K]
NECK_CUT = 500                 # source y; just above the source choker, overlaps the body choker
def soft(m, s): return cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)
def fill_holes(m):
    m = m.astype(np.uint8); ff = m.copy(); mask = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 1); return (m | (1 - ff)).astype(bool)
lum = img @ np.array([.299, .587, .114])
hsv = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
# --- background removal: white flood from the border + enclosed pockets in the hair
d = (255 - img).max(2)
low = (d < 16).astype(np.uint8)
n, lab = cv2.connectedComponents(low)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
face_zone = (xx > 470) & (xx < 815) & (yy > 150) & (yy < 470)
clip_zone = (xx > 780) & (xx < 870) & (yy > 125) & (yy < 220)
pock = (d < 24) & ~face_zone & ~clip_zone & (yy < NECK_CUT)
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(pock.astype(np.uint8))
for i in range(1, n2):
    if st2[i, 4] > 6: bg |= lab2 == i
dnear = cv2.dilate(d, np.ones((9, 9), np.uint8))
band = cv2.dilate(bg.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
est = np.clip((d - 5) / np.maximum(dnear * 0.85 - 5, 8), 0, 1)
a = np.where(band, est, 1.0); a[bg] = 0
a = np.minimum(a, soft(~bg, 0.7) * 1.0 + 0.0)
BGC = np.median(img[bg], axis=0); aa = np.clip(a, 0.05, 1)[..., None]
img = np.where(a[..., None] < 0.98, np.clip((img - (1 - aa) * BGC) / aa, 0, 255), img)
# head = everything above the neck cut (collar / jacket of this image are dropped)
# v6: keep the neck column and hair tips opaque/crisp — no soft fade into empty space
neck_col_src = (xx > 560) & (xx < 720)
neckw = np.where(neck_col_src, np.clip((NECK_CUT + 2 - yy) / 3.0 + 0.5, 0, 1),
                 np.clip((NECK_CUT - yy) / 4.0 + 0.5, 0, 1))
# jacket collar pokes above the cut at the sides — remove anything below the hair tips that is collar-ish
collar = (yy > 440) & ((xx < 560) | (xx > 720)) & ((hsv[..., 1] < 40) & (lum > 200) | ((hsv[..., 0] > 5) & (hsv[..., 0] < 22) & (hsv[..., 1] > 150) & (yy > 455)))
a = a * neckw * (1 - soft(collar, 0.6))
# beside the neck: drop grey shadow strands; hair tips that hang toward the collar stay opaque
side_n = (xx < 596) | (xx > 684)
greyh = side_n & (yy > 440) & (hsv[..., 1] < 70) & (lum > 80)
# steep cut for non-hair side pixels; hair itself keeps a hard tip (see keep_low below)
a = a * np.where(side_n & ~((hsv[..., 1] > 70) & (lum < 160)), np.clip((NECK_CUT - yy) / 8.0, 0, 1), 1)
a = a * (1 - soft(greyh, 0.6))
# behind-neck band: drop jacket leftovers only; keep hair (and its tips) fully opaque to the collar
behind_neck = ((xx > 490) & (xx < 596)) | ((xx > 684) & (xx < 795))
hair_tip = behind_neck & (hsv[..., 1] > 55) & (lum < 185) & (yy < NECK_CUT + 6)
jacket_left = behind_neck & ~hair_tip & (yy > 445) & (
    ((hsv[..., 0] > 4) & (hsv[..., 0] < 24) & (hsv[..., 1] > 100)) |  # orange collar
    ((hsv[..., 1] < 40) & (lum > 190))  # white shirt
)
a = a * (1 - soft(jacket_left, 0.5))
# hair tips over the collar: harden alpha so they rest on the body, not feather into empty space
a = np.where(hair_tip & (a > 0.12), np.maximum(a, 0.96), a)
# below the jaw only hair (and the neck) belongs to the head: drop jacket outlines / lapels
hairlike = ((lum < 140) & ((hsv[..., 0] < 30) | (hsv[..., 2] < 90))) | ((hsv[..., 0] > 4) & (hsv[..., 0] < 22) & (hsv[..., 1] > 120) & (lum < 200))
hairlike = cv2.morphologyEx(hairlike.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
lower = (yy > 420) & ((xx < 588) | (xx > 692))
skinlike = (hsv[..., 0] < 25) & (hsv[..., 1] >= 22) & (lum > 150)
keepm = hairlike | skinlike
nc, lc, sc_, _ = cv2.connectedComponentsWithStats((keepm & (a > 0.2)).astype(np.uint8))
tops = np.full(nc, 9999)
ys_, xs_ = np.nonzero(lc)
np.minimum.at(tops, lc[ys_, xs_], ys_)
attached = (tops < 430)[lc] & (lc > 0)        # strands that hang from the head, not jacket lines
sat_hair = attached & (hsv[..., 1] > 70) & ~(skinlike & (lum > 150) & ((xx < 560) | (xx > 720)))
collar_or = (yy > 440) & (((xx > 530) & (xx < 600)) | ((xx > 680) & (xx < 750))) & (hsv[..., 0] > 4) & (hsv[..., 0] < 24) & (hsv[..., 1] > 120)
keep_low = (sat_hair | (skinlike & (xx > 560) & (xx < 720)) | ((xx > 575) & (xx < 705) & (hsv[..., 0] < 25) & (lum > 100))) & ~collar_or
# hard mask + 1px AA (prefer precise mask over heavy blur)
a = np.where(lower, a * np.clip(soft(keep_low, 0.35) * 1.15, 0, 1), a)
# opaque neck skin under the jaw (no notch / transparent gap)
jaw_neck = skinlike & neck_col_src & (yy > 430) & (yy < NECK_CUT + 1) & (a > 0.05)
a = np.where(jaw_neck, np.maximum(a, 0.98), a)
# hard bottom edge on the neck column (1px AA) so it sits on the body choker without a fade gap
neck_bottom = neck_col_src & (yy >= NECK_CUT - 2) & (yy <= NECK_CUT + 1) & skinlike
a = np.where(neck_col_src & (yy > NECK_CUT + 1), 0, a)
a = np.where(neck_col_src & skinlike & (yy <= NECK_CUT), np.maximum(a, 0.98), a)
# side gaps next to the neck: keep hanging hair opaque down to the collar line
hang = ((xx > 500) & (xx < 575) | (xx > 705) & (xx < 800)) & (yy > 420) & (yy < NECK_CUT + 8)
hang &= (hsv[..., 1] > 50) & (lum < 190) & (a > 0.08)
a = np.where(hang, np.maximum(a, 0.97), a)
# fill any remaining transparent holes inside the hanging hair silhouette
hang_mask = hang.astype(np.uint8)
hang_fill = cv2.morphologyEx(hang_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)
holes = hang_fill & (a < 0.2) & (hsv[..., 1] > 40)
if holes.any():
    # sample from nearby opaque hair
    donor = hang & (a > 0.9)
    ref = np.median(img[donor], axis=0) if donor.sum() > 20 else np.array([70, 45, 35], np.float32)
    img = np.where(holes[..., None], ref, img)
    a = np.where(holes, 0.97, a)

# --- colour harmonise to the body (neck skin)
# reference = the stage-1 (half-body) head's lit cheek, which shares the body's lighting
ref = np.asarray(Image.open(OUT + 'head.png').convert('RGBA')).astype(np.float32); ro = rig['layers']['head']
cy_, cx_ = int(300 - ro[1]), int(440 - ro[0])   # rig px of the lit cheek between eye and mouth
body_skin = ref[cy_ - 5:cy_ + 5, cx_ - 5:cx_ + 5, :3].reshape(-1, 3).mean(0)
src_skin = img[345:365, 585:615].reshape(-1, 3).mean(0)
gain = 1 + 0.6 * (body_skin / src_skin - 1)
print('skin body', body_skin.round(), 'src', src_skin.round(), 'gain', gain.round(3))
img = np.clip(img * gain, 0, 255)
lum = img @ np.array([.299, .587, .114]); hsv = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
# --- eyes
def circle(cx, cy, r): return ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
eyes = {}
for side, (cx, cy, r), box in [('l', (559.5, 283.5, 23.5), (494, 246, 600, 314)), ('r', (720.5, 281.5, 23.5), (681, 243, 787, 314))]:
    bxm = np.zeros((H, W), bool); bxm[box[1]:box[3], box[0]:box[2]] = True
    iris_px = circle(cx, cy, r) & bxm & ((hsv[..., 1] > 85) | (lum < 130) | (lum > 235))
    sclera = bxm & (lum > 185) & (hsv[..., 1] < 40)
    dark = bxm & (lum < 95)
    op = cv2.morphologyEx(((sclera | iris_px) & ~(dark & ~circle(cx, cy, r * 0.8))).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    nn, lb, st, _ = cv2.connectedComponentsWithStats(op); k = 1 + np.argmax(st[1:, 4]); op = fill_holes(lb == k)
    op &= cv2.dilate((sclera | iris_px).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    # the dark iris rim belongs to the opening too (column-wise between the opening's top and
    # bottom), otherwise it would be left in the lash layer and stay behind when the iris moves
    # The opening reaches up to the lower edge of the thick upper lash: the upper sclera is in
    # shadow (greyish) and the upper iris is dark, so threshold masks miss them. Measure the
    # lash's lower edge in the sclera columns, fit a smooth lid curve, and fill the opening
    # column-wise from that curve down to the lower lid.
    disc = circle(cx, cy, r)
    cols = [x for x in range(box[0], box[2]) if op[:, x].any()]
    meas_x, meas_y = [], []
    for x in cols:
        if abs(x - cx) < r + 2: continue
        # walk up from inside the sclera until the lash (very dark) starts
        y = int(np.where(op[:, x])[0].mean())
        if lum[y, x] < 120: continue
        while y > box[1] and lum[y - 1, x] >= 85: y -= 1
        meas_x.append(x); meas_y.append(y)
    fit = None
    if len(meas_x) >= 6:
        mx, my = np.array(meas_x, float), np.array(meas_y, float)
        for _ in range(3):  # robust: drop outliers (hair strands, highlights) and refit
            fit = np.polyfit(mx, my, 2); res = np.abs(np.polyval(fit, mx) - my)
            keep_ = res < max(2.0, np.percentile(res, 75) * 1.5)
            mx, my = mx[keep_], my[keep_]
        for x in cols:
            bot_ = np.where(op[:, x])[0].max()
            t = np.polyval(fit, x) + 1.5
            ys_ = np.arange(H)
            op[(ys_ >= t) & (ys_ <= bot_), x] = True
    op = cv2.morphologyEx(op.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
    ring = cv2.dilate(op.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 13))).astype(bool) & ~op
    lash = (ring & (lum < 125) & bxm)
    lash = cv2.morphologyEx(lash.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
    # whole eye region: opening + every dark stroke attached to it (upper lash, wing, lower lash,
    # crease) inside a slightly expanded box. Everything in here leaves the face base layer.
    bxe = np.zeros((H, W), bool); bxe[box[1] - 22:box[3] + 10, box[0] - 18:box[2] + 18] = True
    near = cv2.dilate(op.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(bool)
    darkc = bxe & (lum < 150)
    nd, ld, _, _ = cv2.connectedComponentsWithStats(darkc.astype(np.uint8), connectivity=8)
    att = np.zeros((H, W), bool)
    for i in np.unique(ld[near & darkc]):
        if i: att |= ld == i
    region = cv2.dilate(op.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 21))).astype(bool)
    # bounded by an ellipse around the opening (wider toward the outer corner wing) and never
    # into the side hair, so no hair ever ends up in the lash layer
    oys, oxs = np.where(op)
    ocx, ocy = (oxs.min() + oxs.max()) / 2, (oys.min() + oys.max()) / 2
    orx, ory = (oxs.max() - oxs.min()) / 2, (oys.max() - oys.min()) / 2
    outer_left = side == 'l'
    rx_ = np.where((xx < ocx) == outer_left, orx + 26, orx + 12)
    ell = ((xx - ocx) / rx_) ** 2 + ((yy - ocy) / (ory + 19)) ** 2 < 1
    region = (region | cv2.dilate(att.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)) & bxe & ell
    region &= (xx > 486) & (xx < 800)
    if fit is not None:  # nothing far above the lash line (that is hair / brow area)
        region &= yy > np.polyval(fit, xx) - 27
    eyes[side] = dict(c=(cx, cy), r=r, op=op, iris=circle(cx, cy, r), lash=lash, box=box, region=region)
# --- bangs (hair over the forehead / eye tops) → drawn above the eyes so blinks never erase them
hair = (lum < 125) & (a > 0.3) & ((hsv[..., 0] < 30) | (hsv[..., 2] < 90))
eye_any = np.any([e['op'] for e in eyes.values()], 0)
bangs_zone = (xx > 470) & (xx < 815) & (yy > 60) & (yy < 300)
lash_any = np.any([e['lash'] for e in eyes.values()], 0)
bangs = hair & bangs_zone & ~cv2.dilate((eye_any | lash_any).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
# keep only hair connected to the main fringe (drop isolated lash fragments)
nb, lb, st, _ = cv2.connectedComponentsWithStats(bangs.astype(np.uint8))
keep = np.zeros_like(bangs)
for i in range(1, nb):
    ys = np.where(lb == i)[0]
    if ys.min() < 230 and st[i, 4] > 30: keep |= lb == i
bangs = soft(cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8)), 0.8) * a
# nothing of the eyes may stay in the fringe layer (lash strokes there doubled the lash line)
for e in eyes.values():
    bangs = bangs * (1 - soft(cv2.dilate(e['region'].astype(np.uint8), np.ones((3, 3), np.uint8)), 1.0))
# --- side hair (secondary motion), ribbon
root = np.clip((yy - 330) / 30, 0, 1)
sideL = soft(hair & (xx < 478) & (yy < NECK_CUT), 1.0) * root * a
sideR = soft(hair & (xx > 808) & (yy < NECK_CUT), 1.0) * root * a
orange = (hsv[..., 0] > 4) & (hsv[..., 0] < 22) & (hsv[..., 1] > 120) & (hsv[..., 2] > 120)
rbox = (xx > 832) & (xx < 905) & (yy > 165) & (yy < 275)
rib = soft(cv2.dilate((orange & rbox).astype(np.uint8), np.ones((5, 5), np.uint8)), 0.9) * a * rbox
# --- skin under eyes and mouth: smooth field sampled from skin pixels only
mbox = np.zeros((H, W), bool); mbox[380:405, 600:692] = True
mouth_m = mbox & (lum < 185)
mouth_m = cv2.morphologyEx(mouth_m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 7), np.uint8)).astype(bool)
hole = np.zeros((H, W), bool)
for e in eyes.values():
    hole |= cv2.dilate(e['region'].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
hole_m = cv2.dilate(mouth_m.astype(np.uint8), np.ones((7, 9), np.uint8)).astype(bool)
hole |= hole_m
valid = (~hole & (lum > 175) & (hsv[..., 1] < 120) & face_zone).astype(np.float32)
num = cv2.GaussianBlur(img * valid[..., None], (0, 0), 14); den = cv2.GaussianBlur(valid, (0, 0), 14)[..., None]
fillc = num / np.maximum(den, 1e-4)
hs = np.clip(soft(hole, 2.5) * 1.2, 0, 1)[..., None]
skin = img * (1 - hs) + fillc * hs
# stray specks next to the eyes (isolated lash-tip dots) → skin
near_eye = np.zeros((H, W), bool)
for e in eyes.values(): near_eye |= cv2.dilate(e['region'].astype(np.uint8), np.ones((31, 31), np.uint8)).astype(bool)
slum = skin @ np.array([.299, .587, .114])
dots = near_eye & (slum < cv2.GaussianBlur(slum, (0, 0), 6) - 18)
nd_, ld_, st_, _ = cv2.connectedComponentsWithStats(dots.astype(np.uint8), connectivity=8)
speck = np.isin(ld_, [i for i in range(1, nd_) if st_[i, 4] <= 25])
speck = cv2.dilate(speck.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
skin = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(np.clip(skin, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR), speck.astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB).astype(np.float32)
print('specks removed', int(speck.sum()))
# under the ribbon: paint hair (inpaint) so the swaying ribbon reveals hair, not a hole
behind = rbox & (xx < 862) & (cv2.dilate(hair.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0)
skin = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(skin.astype(np.uint8), cv2.COLOR_RGB2BGR), ((rib > 0.05) & behind).astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB).astype(np.float32)
# side hair stays in the head layer too: swaying strands reveal hair, never a seam
head_a = a * np.where(behind, 1, (1 - rib / np.maximum(a, 1e-3)).clip(0, 1))
# --- save helpers (trimmed, native res, scale K)
def save(name, rgb, alpha):
    arr = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1) * 255]).astype(np.uint8); arr[arr[..., 3] < 3] = 0
    im = Image.fromarray(arr, 'RGBA'); bb = im.getbbox() or (0, 0, 1, 1)
    bb = (max(bb[0] - 2, 0), max(bb[1] - 2, 0), min(bb[2] + 2, W), min(bb[3] + 2, H))
    im.crop(bb).save(OUT + name + '.png', optimize=True)
    rig['layers'][name] = [*to_rig(bb[0], bb[1]), K]
for k in ['eye-l', 'eye-r', 'eyes-closed', 'eyes-happy', 'mouth', 'mouth-open', 'mouth-o', 'mouth-frown', 'hair-side-l', 'hair-side-r', 'ribbon', 'head', 'lid-l', 'lid-r', 'happy-l', 'happy-r']:
    rig['layers'].pop(k, None)
save('head', skin, head_a)
save('bangs', img, bangs)
save('hair-side-l', img, sideL); save('hair-side-r', img, sideR); save('ribbon', img, rib)
for side, e in eyes.items():
    op = soft(e['op'], 0.6)
    bx = e['box']; ys0, ys1, xs0, xs1 = bx[1] - 16, bx[3] + 12, bx[0] - 14, bx[2] + 14
    # white: the source's own sclera where visible; under the iris a smooth white sampled
    # from the sclera (with the art's top shading), so a moved iris never reveals dark pixels
    scl = e['op'] & ~cv2.dilate(e['iris'].astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & (lum > 170)
    sv = scl.astype(np.float32)
    nm = cv2.GaussianBlur(img * sv[..., None], (0, 0), 6); dn = cv2.GaussianBlur(sv, (0, 0), 6)[..., None]
    base = np.where(dn > 1e-3, nm / np.maximum(dn, 1e-4), np.array([240, 236, 234], np.float32))
    ys, _ = np.where(e['op']); top, bot = ys.min(), ys.max()
    shade = np.clip((yy - top) / max(1, (bot - top) * 0.5), 0, 1)[..., None]
    base = base * (0.8 + 0.2 * shade)
    keep_src = soft(scl, 0.8)[..., None]
    wht = img * keep_src + base * (1 - keep_src)
    save(f'eye-white-{side}', wht, op)
    # lash: every pixel of the eye region that differs from the clean skin, colour un-mixed
    # against that skin, so at rest  skin + lash  reproduces the source exactly (pixel aligned)
    # never inside the opening (white / visible iris): those belong to the white and iris layers
    reg = e['region'] & ~cv2.erode(e['op'].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    diff = np.abs(img - skin).max(-1)
    # only real strokes: faint skin-tone residue would show as a box once the features
    # parallax-shift over the head, so it stays in the (clean) face layer instead
    dl = (skin @ np.array([.299, .587, .114])) - lum   # darker than the clean skin
    la = np.maximum(np.clip((diff - 16) / 22, 0, 1), np.clip((dl - 6) / 16, 0, 1)) * soft(reg, 1.0)
    la = cv2.morphologyEx((la * 255).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)).astype(np.float32) / 255
    la[la < 0.06] = 0
    col = img  # straight source colour: no un-mixing artefacts (halo) at the stroke edges
    save(f'lash-{side}', col, la)
    e['la'] = la
    # iris pixels hidden under the lashes are NOT kept (they are lash pixels): repaint that part
    # of the disc from the visible iris so a moving iris never drags lash lines over the eye
    vis = e['iris'] & cv2.erode(e['op'].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    hid = (e['iris'] & ~vis).astype(np.uint8) * 255
    bx = e['box']; sub = np.ascontiguousarray(img[bx[1]:bx[3], bx[0]:bx[2]].astype(np.uint8))
    rep = img.copy()
    rep[bx[1]:bx[3], bx[0]:bx[2]] = cv2.inpaint(sub, np.ascontiguousarray(hid[bx[1]:bx[3], bx[0]:bx[2]]), 4, cv2.INPAINT_TELEA)
    save(f'iris-{side}', rep, soft(e['iris'], 0.6))
    cx, cy = e['c']; r = e['r']
    # closed / happy eyes are drawn procedurally by the renderer from these metrics
    ys, xs = np.where(e['op'])
    lx0, ly0 = to_rig(xs.min(), ys.min()); lx1, ly1 = to_rig(xs.max(), ys.max())
    lp = e['lash'] & (yy < e['c'][1])
    col = np.median(img[lp & (lum < 90)], axis=0) if (lp & (lum < 90)).sum() > 10 else np.array([60, 34, 30])
    lys = np.where(lp)[0]
    thick = float(np.median(lp[:, xs.min():xs.max()].sum(0)[lp[:, xs.min():xs.max()].sum(0) > 0])) * K
    rig.setdefault('eyes', {})[side] = {'x0': lx0, 'x1': lx1, 'top': ly0, 'bottom': ly1, 'lash': max(1.6, min(thick, 5.0))}
    rig['lashColor'] = '#%02x%02x%02x' % tuple(int(v) for v in col)
    rig['anchors'][f'iris{side.upper()}'] = to_rig(cx, cy)
    rig['anchors'][f'eye{side.upper()}'] = to_rig(cx, cy + r * 0.9)  # squash pivot on the lower lid
    rig.setdefault('irisRadius', {})[side] = r * K
# strokes already in the lash layers must not be drawn a second time by the fringe
bangs_f = bangs * (1 - np.clip(sum(e['la'] for e in eyes.values()), 0, 1))
nb2, lb2, st2, _ = cv2.connectedComponentsWithStats((bangs_f > 0.1).astype(np.uint8), connectivity=8)
small = np.isin(lb2, [i for i in range(1, nb2) if st2[i, 4] < 40])
bangs_f = bangs_f * (1 - soft(cv2.dilate(small.astype(np.uint8), np.ones((3, 3), np.uint8)), 0.7))
save('bangs', img, bangs_f)
# --- mouths, painted in this art's style around its own lip line
lipline = soft(mouth_m, 0.6)
LINE = np.array([120, 62, 58], np.float32)
save('mouth', img, lipline)
def painted_mouth(name, h_open, w_scale=1.0, frown=False, round_=False):
    SS = 4
    ys, xs = np.where(mouth_m); x0, x1 = xs.min(), xs.max(); cx = (x0 + x1) / 2; ytop = ys.min()
    w = (x1 - x0) * w_scale
    can = Image.new('RGBA', (W * SS // 4, H * SS // 4))  # placeholder (unused size)
    from PIL import ImageDraw
    big = Image.new('RGBA', (int(w + 40) * SS, int(h_open + 40) * SS), (0, 0, 0, 0)); dr = ImageDraw.Draw(big)
    ox, oy = 20 * SS, 20 * SS
    def P(x, y): return (ox + x * SS, oy + y * SS)
    pts_top, pts_bot = [], []
    for i in range(41):
        t = i / 40; x = t * w
        curve = 4 * t * (1 - t)
        if frown: ytop_c = 3 * curve; ybot = ytop_c
        else:
            ytop_c = -1.5 * curve if not round_ else -h_open * 0.45 * math.sqrt(max(0, curve))
            ybot = h_open * (curve ** 0.8) if not round_ else h_open * 0.55 * math.sqrt(max(0, curve))
        pts_top.append(P(x, ytop_c)); pts_bot.append(P(x, ybot))
    if not frown:
        dr.polygon(pts_top + pts_bot[::-1], fill=(150, 62, 66, 255))
        # tongue
        tw = w * 0.5; tx = (w - tw) / 2
        dr.chord([P(tx, h_open * 0.35), P(tx + tw, h_open * 1.2)], 180, 360, fill=(224, 128, 124, 255))
        dr.polygon(pts_top + pts_bot[::-1], outline=None)
        # clip tongue to mouth shape
        m = Image.new('L', big.size, 0); ImageDraw.Draw(m).polygon(pts_top + pts_bot[::-1], fill=255)
        big.putalpha(Image.fromarray(np.minimum(np.asarray(big)[..., 3], np.asarray(m))))
        dr = ImageDraw.Draw(big)
    dr.line(pts_top, fill=tuple(int(v) for v in LINE) + (255,), width=int(1.6 * SS), joint='curve')
    if not frown:
        dr.line(pts_bot, fill=(170, 90, 86, 200), width=int(1.0 * SS), joint='curve')
    sm = big.resize((big.width // SS, big.height // SS), Image.LANCZOS)
    arr = np.asarray(sm).astype(np.float32)
    can = np.zeros((H, W, 4), np.float32)
    px, py = int(cx - w / 2 - 20), int(ytop + 1 - 20)
    can[py:py + arr.shape[0], px:px + arr.shape[1]] = arr
    save(name, can[..., :3], can[..., 3] / 255)
painted_mouth('mouth-open', 9)
painted_mouth('mouth-o', 10, w_scale=0.45, round_=True)
painted_mouth('mouth-frown', 0, w_scale=0.7, frown=True)
ys, xs = np.where(mouth_m)
rig['anchors']['mouth'] = to_rig((xs.min() + xs.max()) / 2, ys.min() + 2)
rig['anchors']['neck'] = to_rig(640, 492)
rig['anchors']['cheekL'] = to_rig(548, 335); rig['anchors']['cheekR'] = to_rig(732, 335)
rig['anchors']['hairL'] = to_rig(440, 340); rig['anchors']['hairR'] = to_rig(845, 340)
rig['anchors']['ribbon'] = to_rig(850, 180); rig['anchors']['headTop'] = to_rig(640, 40)
# --- crown: the source crops the top of the head at y=0, so paint the missing dome
# (circle fitted to the hair silhouette, filled with the top rows reflected, dark outline)
PAD = 64
rows = [(y, *np.where(a[y] > 0.5)[0][[0, -1]]) for y in (0, 30, 60)]
xc = sum((r[1] + r[2]) / 2 for r in rows) / 3
w0, w60 = (rows[0][2] - rows[0][1]) / 2, (rows[2][2] - rows[2][1]) / 2
yc = (w60 ** 2 + 3600 - w0 ** 2) / 120.0; R = math.sqrt(w0 ** 2 + yc ** 2)
cw = int(2 * R + 8); x0c = int(xc - cw / 2)
dome = np.zeros((PAD + 12, cw, 4), np.float32)
gy, gx = np.mgrid[0:PAD + 12, 0:cw]
sy = gy - PAD                       # source y (negative = painted area)
sx = gx + x0c
inside = (sx - xc) ** 2 + (sy - yc) ** 2 <= R * R
# strands continue upward: stretch the first real rows toward the dome centre, slightly darker
ref_y = np.where(sy >= 0, sy, 4).astype(int)
fx = np.where(sy >= 0, sx, xc + (sx - xc) * np.clip(w0 / np.maximum(np.sqrt(np.maximum(R * R - (sy - yc) ** 2, 1)), 1), 0, 1.6))
dome[..., :3] = img[ref_y, np.clip(fx, 0, W - 1).astype(int)]
dome[..., :3] = cv2.GaussianBlur(dome[..., :3], (0, 0), 0.8)
dark = np.clip(-sy / PAD, 0, 1)[..., None]
dome[..., :3] *= (1 - 0.18 * dark)
dist = R - np.sqrt((sx - xc) ** 2 + (sy - yc) ** 2)
edge = np.clip(1 - np.abs(dist - 1.2) / 1.4, 0, 1)
dome[..., :3] = dome[..., :3] * (1 - edge[..., None]) + np.array([58, 34, 26]) * edge[..., None]
alpha = np.clip(dist + 0.5, 0, 1) * inside
alpha *= np.clip((8 - sy) / 8, 0, 1)                # fade into the real hair over the first rows
dome[..., 3] = alpha
im = Image.fromarray(np.dstack([np.clip(dome[..., :3], 0, 255), dome[..., 3:] * 255]).astype(np.uint8), 'RGBA')
im.save(OUT + 'crown.png', optimize=True)
rig['layers']['crown'] = [*to_rig(x0c, -PAD), K]
# --- body: drop the stage-1 hair tips / wisps between the old chin and the collar
bim = Image.open(OUT + 'body.png').convert('RGBA'); bo = rig['layers']['body']
barr = np.asarray(bim).astype(np.float32)
by_, bx_ = np.mgrid[0:barr.shape[0], 0:barr.shape[1]]
ry, rx = by_ + bo[1], bx_ + bo[0]
nl, nr = to_rig(588, 0)[0], to_rig(692, 0)[0]
neck_col = (rx > nl) & (rx < nr)
brgb = barr[..., :3]; bl = brgb @ np.array([.299, .587, .114])
bhsv = cv2.cvtColor(np.clip(brgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
zone = (ry < 436) & ~neck_col
old_hair = zone & (barr[..., 3] > 10) & (bl < 105) & (bl > 30) & (bhsv[..., 0] < 25) & (bhsv[..., 1] > 70) & ~((rx > 425) & (rx < 525) & (ry > 392))
wisps = zone & (ry < 402) & (barr[..., 3] > 0) & (bhsv[..., 1] < 90) & ~((rx > 425) & (rx < 525))
old_hair = cv2.dilate(old_hair.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
# re-fill hair spots that sit on the collar/jacket (row-wise inside the remaining silhouette)
solid = (barr[..., 3] > 200) & ~old_hair & ~wisps
inside = np.zeros_like(solid)
for y in range(solid.shape[0]):
    xs_ = np.where(solid[y])[0]
    if len(xs_): inside[y, xs_.min():xs_.max() + 1] = True
fix = old_hair & inside & (ry > 398)
brgb = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(np.clip(brgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR), fix.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB).astype(np.float32)
barr[..., :3] = brgb
alpha = barr[..., 3].copy()
alpha[(old_hair & ~fix) | wisps] = 0
alpha[fix] = 255
alpha[(ry < 368) & ~neck_col] = 0
# v6: crisp alpha on the neck column; light AA only away from the join
neck_zone = neck_col & (ry >= 368) & (ry < 410)
alpha_blur = cv2.GaussianBlur(alpha, (0, 0), 0.4)
barr[..., 3] = np.where(neck_zone, np.where(alpha > 12, 255, alpha), alpha_blur)
# replace the stage-1 soft pale rectangle with a short under-jaw pad matched to chest
brgb = barr[..., :3].astype(np.float32)
bl = brgb @ np.array([.299, .587, .114])
bhsv = cv2.cvtColor(np.clip(brgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
chest = (ry > 412) & (ry < 448) & (np.abs(rx - 474) < 32) & (barr[..., 3] > 200)
chest &= (bhsv[..., 0] < 25) & (bhsv[..., 1] > 18) & (bhsv[..., 2] > 130)
nc_body = np.median(brgb[chest], axis=0) if chest.sum() > 30 else np.array([232, 178, 154], np.float32)
half_w = 18 + 14 * np.clip((ry - 372) / 26.0, 0, 1)
neck_mask = (np.abs(rx - 474) < half_w) & (ry >= 372) & (ry < 398) & neck_col
choker = (ry >= 392) & (ry <= 410) & (np.abs(rx - 474) < 42) & (bl < 90) & (barr[..., 3] > 180)
neck_mask &= ~choker
old_pale = neck_col & (ry >= 300) & (ry < 390) & (bl > 200) & (bhsv[..., 1] < 55)
# clear old pale rect above the pad
clear = old_pale & (ry < 372)
t = np.clip((ry - 372) / 24.0, 0, 1)
shade = 0.82 + 0.18 * np.sin(np.clip(t, 0, 1) * np.pi) - 0.05 * np.clip((t - 0.8) / 0.2, 0, 1)
fill_rgb = nc_body * shade[..., None]
write = neck_mask | (old_pale & (ry >= 372) & ~choker)
brgb = np.where(write[..., None], fill_rgb, brgb)
brgb = np.where(clear[..., None], 0, brgb)
alpha = barr[..., 3].astype(np.float32)
alpha = np.where(write, 255, alpha)
alpha = np.where(clear, 0, alpha)
# 1px AA on pad edge only
edge = soft((write & ~clear).astype(np.float32), 0.35)
brgb = np.where((edge > 0.01)[..., None] & ~write[..., None] & ~clear[..., None],
                brgb * (1 - edge[..., None]) + fill_rgb * edge[..., None], brgb)
alpha = np.where(~clear, np.maximum(alpha, edge * 255), alpha)
barr[..., :3] = brgb
barr[..., 3] = alpha
Image.fromarray(np.clip(barr, 0, 255).astype(np.uint8), 'RGBA').save(OUT + 'body.png', optimize=True)
json.dump(rig, open(OUT + 'rig.json', 'w'), indent=1)
print(json.dumps({k: [round(v, 1) for v in val] if isinstance(val, list) else val for k, val in rig['anchors'].items()}))
