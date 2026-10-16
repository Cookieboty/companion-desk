#!/usr/bin/env python3
"""Step 1 of the arm parts: 'sleeve solid' in rig space.

= official arm layer pixels above Y0  +  official draft pixels (nomi-clean-halfbody.jpg, x2 into rig space) below Y0
  (white blouse end, black strap + buckle, white cuff, orange cuff lining), cut along hand-set polygons.
No pixel is invented here; the draft pixels are exactly the ones the layer was cut from, the layer just fades them out.
"""
import sys; sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from rc_common import *

Y0 = 975
YB = 962   # polygon starts a little above Y0 so the blur never leaves a hairline
Hc = 1300
POLY = {
    'l': [(20, YB), (236, YB), (236, 1060), (172, 1100), (172, 1222), (20, 1222)],
    'r': [(940, YB), (718, YB), (718, 1060), (772, 1100), (772, 1222), (940, 1222)],
}

def draft_rig():
    jpg = cv2.imread(str(DRAFT))
    M = np.array([[JPG_K, 0, BODY_OFF[0] - JPG_K * JPG_ORIGIN[0]], [0, JPG_K, BODY_OFF[1] - JPG_K * JPG_ORIGIN[1]]])
    return cv2.warpAffine(jpg, M, (RIGSZ[0], Hc), flags=cv2.INTER_CUBIC, borderValue=(250, 250, 250))

def sleeve_solid(side):
    big = draft_rig()
    bg = np.median(big[5:30, 5:30].reshape(-1, 3), axis=0)
    dist = np.abs(big.astype(np.int16) - bg.astype(np.int16)).max(2)
    nb = (dist > 9).astype(np.uint8)
    poly = np.zeros(nb.shape, np.uint8)
    cv2.fillPoly(poly, [np.array(POLY[side], np.int32)], 1)
    nb = nb * poly
    nb = cv2.morphologyEx(nb, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # fill holes inside the polygon: flood from outside the polygon-bbox corners
    barrier = nb.copy()
    pts = POLY[side]
    inner = pts[1:5] if side == 'l' else pts[1:5]
    cv2.polylines(barrier, [np.array(inner, np.int32)], False, 1, 4)
    cv2.line(barrier, pts[0], pts[1], 1, 4); cv2.line(barrier, pts[4], pts[5], 1, 4)
    ff = (1 - barrier).astype(np.uint8); h, w = ff.shape
    m = np.zeros((h + 2, w + 2), np.uint8)
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        cv2.floodFill(ff, m, seed, 2)
    filled = ((ff != 2)).astype(np.uint8) * poly
    filled = cv2.morphologyEx(filled, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))  # drops the 4px barrier lines
    # remove skin (hand) under the orange lining: keep only high-saturation pixels or bright cuff for y>1185
    hsv = cv2.cvtColor(big, cv2.COLOR_BGR2HSV)
    low = np.zeros_like(filled); low[1186:] = 1
    skin = ((hsv[..., 1] < 120) & (hsv[..., 2] > 150) & (hsv[..., 0] < 25)).astype(np.uint8)
    white = (hsv[..., 1] < 40).astype(np.uint8)
    filled = np.where((low == 1) & (skin == 1) & (white == 0), 0, filled).astype(np.uint8)
    pre = filled.copy()
    k9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    cl = cv2.morphologyEx(filled, cv2.MORPH_CLOSE, k9)
    filled = np.where(low == 1, cl, filled).astype(np.uint8)
    filled = cv2.morphologyEx(filled, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # largest component only
    n, lab, stats, _ = cv2.connectedComponentsWithStats(filled)
    if n > 1:
        k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])); filled = (lab == k).astype(np.uint8)
    a_ext = cv2.GaussianBlur(filled.astype(np.float32), (0, 0), 0.7)
    ext = np.dstack([big, (a_ext * 255).astype(np.uint8)])
    lay = np.zeros((Hc, RIGSZ[0], 4), np.uint8)
    lay[:RIGSZ[1]] = layer_in_rig('arm-' + side)
    out = lay.copy()
    out[Y0 + 4:] = ext[Y0 + 4:]
    out[YB:Y0 + 4, :, :3] = np.where(lay[YB:Y0 + 4, :, 3:4] > 0, lay[YB:Y0 + 4, :, :3], ext[YB:Y0 + 4, :, :3])
    out[YB:Y0 + 4, :, 3] = np.maximum(lay[YB:Y0 + 4, :, 3], ext[YB:Y0 + 4, :, 3])
    # un-fade the layer above Y0? (alpha there is already ~255 except the cut edges)
    return out, filled

if __name__ == '__main__':
    W = '/workspace/screenshots/nomi-rive-complete/work/'
    for s in 'lr':
        out, f = sleeve_solid(s)
        cv2.imwrite(f'/workspace/scratch/rc/sleeve-solid-{s}.png', out)
        bgc = np.full(out.shape[:2] + (3,), (200, 150, 110), np.uint8)
        x0 = 20 if s == 'l' else 640
        cv2.imwrite(W + f'sleeve-solid-{s}.png', over(bgc, out)[880:1260, x0:x0 + 300])
