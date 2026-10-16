#!/usr/bin/env python3
"""Step 2: completed arm textures (straight frame, spine vertical) for both arms.

official = sleeve_solid (layer + draft below the fade)  -> NEVER modified
generated (G) = tube completion: the inner half of the sleeve that the jacket front panel hides in the draft
                (neural inpainting with LaMa, then a dark outline stroke along the new silhouette)
final = official OVER generated.   Output: rive/nomi-complete/parts/arm-{l,r}-complete.png (+ -official.png mask)
"""
import sys, json; sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from rc_common import *
import make_sleeve_solid as mss
import lama

def median_filter(x, k, mode='nearest'):
    h = k // 2; xp = np.pad(x, h, mode='edge')
    return np.array([np.median(xp[i:i + k]) for i in range(len(x))])

def gaussian_filter1d(x, sigma):
    return cv2.GaussianBlur(x.reshape(-1, 1).astype(np.float32), (1, 0), sigma, borderType=cv2.BORDER_REPLICATE).ravel()

STRAP = {'l': (128.0, 1127.0), 'r': (812.0, 1127.0)}
OUTLINE = (88, 80, 86)  # BGR, sampled from the official outline pixels (see report)

def ns_of(a, x, y):
    dx, dy = x - a['s0'][0], y - a['s0'][1]
    return dx * a['w'][0] + dy * a['w'][1], dx * a['u'][0] + dy * a['u'][1]

def run(side, use_lama=True, out_dir=PARTS):
    out_dir.mkdir(parents=True, exist_ok=True)
    a = arm_geom(side)
    solid, _ = mss.sleeve_solid(side)
    S = rig_canvas_to_straight(solid, a)           # BGRA straight
    flip = side == 'r'
    if flip: S = S[:, ::-1].copy()
    H, W = S.shape[:2]
    A = S[..., 3].astype(np.float32) / 255
    A0 = A > 0.5
    # geometry in (possibly flipped) frame: column i -> n = TEX_N0 + i  (flipped: n' = -n)
    sg = -1 if flip else 1
    pn, ps = ns_of(a, *a['pivot']); sn, ss = ns_of(a, *STRAP[side])
    pn, sn = sg * pn, sg * sn
    # outer edge profile per row (first run >= 8 px from the left)
    outer = np.full(H, np.nan)
    for j in range(H):
        xs = np.where(A0[j])[0]
        if len(xs) < 8: continue
        runs = np.split(xs, np.where(np.diff(xs) != 1)[0] + 1)
        r = next((r for r in runs if len(r) >= 8), None)
        if r is not None: outer[j] = r[0]
    rows = np.where(~np.isnan(outer))[0]
    j0, j1 = rows.min(), rows.max()
    idx = np.arange(H)
    o = np.interp(idx, rows, outer[rows]); o = gaussian_filter1d(median_filter(o, 9, mode='nearest'), 3)
    s_of = lambda j: TEX_S0 + j
    n_of = lambda i: (TEX_N0 + i) if not flip else (-(TEX_N0 + i))   # frame n (already flipped), for centre calc use i directly
    # centre line in column units
    ci_pivot = (pn - TEX_N0) if not flip else (pn - TEX_N0)           # pn already sign-adjusted; i = n' - N0 ... see below
    # in the flipped frame, column i corresponds to n' = TEX_N0 + i  where n' = -n(original) - 1
    ci_p = pn - TEX_N0; ci_s = sn - TEX_N0
    jp = ps - TEX_S0; js = ss - TEX_S0
    c = np.interp(idx, [jp, js], [ci_p, ci_s])
    c[idx < jp] = ci_p; c[idx > js] = ci_s
    # tube width profile (px, along the spine): hand-set from the draft's loose bishop sleeve (shoulder -> puff -> strap)
    prof = np.array([(-20, 40), (20, 46), (60, 56), (140, 86), (220, 102), (380, 110), (520, 124), (620, 148), (680, 120), (730, 82), (800, 82)], np.float32)
    wd = np.interp(s_of(idx), prof[:, 0], prof[:, 1])
    # outer profile: extrapolate flat above the first reliable row so the top cap is round, not a trumpet
    sel = (idx >= j0 + 40) & (idx <= j1 - 140)
    of = np.polyval(np.polyfit(idx[sel], o[sel], 3), idx)       # smooth outer-edge model (the raw edge has gadget/pocket bumps)
    o_s = np.where(idx < j0 + 40, np.minimum(o, of), of)
    o_s = np.maximum(o_s, 0)
    inner = o_s + wd
    inner = gaussian_filter1d(inner, 4)
    R = 38.0
    top = j0
    cap = np.clip((idx - top) / R, 0, 1); cap = np.sqrt(1 - (1 - cap) ** 2)
    c = (o + inner) / 2; half = (inner - o) / 2
    half_eff = np.maximum(half, 0) * cap
    T = np.zeros((H, W), bool)
    for j in range(j0, j1 + 1):
        lo = int(round(c[j] - half_eff[j])); hi = int(round(c[j] + half_eff[j]))
        T[j, max(lo, 0):min(hi + 1, W)] = True
    T |= A0
    T = cv2.morphologyEx(T.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)
    # hidden area = only what is UNDER the torso at rest (the arm is drawn behind body-noarm): clip the tube to body-noarm's footprint
    cov = rig_canvas_to_straight(layer_in_rig('body-noarm'), a)[..., 3] > 40
    if flip: cov = cov[:, ::-1].copy()
    cov_in = cv2.erode(cov.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)      # strictly under the torso (outline allowed here only)
    cov = cv2.dilate(cov.astype(np.uint8), np.ones((11, 11), np.uint8)).astype(bool)   # a few px of slack closes the cut-line seam
    T = (T & cov) | A0
    gen_mask = T & ~cv2.dilate(A0.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    # context image for the inpainter: official over white background
    bgc = np.array([246, 248, 250], np.float32)
    rgb = (S[..., :3].astype(np.float32) * A[..., None] + bgc * (1 - A[..., None])).astype(np.uint8)
    rgb[~T & ~A0] = bgc.astype(np.uint8)
    G = rgb.copy()
    # (1) tone init: per-row cloth tone sampled just inside the official cut edge (cloth pixels only: bright + unsaturated)
    hsv = cv2.cvtColor(S[..., :3], cv2.COLOR_BGR2HSV)
    cloth = A0 & (hsv[..., 2] > 175) & (hsv[..., 1] < 70)
    tone = np.full((H, 3), np.nan, np.float32); cutc = np.full(H, np.nan)
    for j in range(j0, j1 + 1):
        xs = np.where(A0[j])[0]
        if len(xs) == 0: continue
        cutc[j] = xs.max()
        sel = cloth[j, max(xs.max() - 34, 0):xs.max() - 2]
        px = S[j, max(xs.max() - 34, 0):xs.max() - 2, :3][sel]
        if len(px) >= 6: tone[j] = np.median(px, axis=0)
    good = ~np.isnan(tone[:, 0])
    for k in range(3):
        tone[:, k] = np.interp(idx, idx[good], tone[good, k])
    cutc = np.interp(idx, idx[~np.isnan(cutc)], cutc[~np.isnan(cutc)])
    for k in range(3): tone[:, k] = gaussian_filter1d(tone[:, k], 8)
    cols = np.arange(W)[None, :]
    d = np.clip((cols - cutc[:, None]) / np.maximum(inner[:, None] - cutc[:, None], 8), 0, 1)   # 0 at cut, 1 at new edge
    shade = 1 - 0.07 * (d * d * (3 - 2 * d))
    init = np.clip(tone[:, None, :] * shade[..., None], 0, 255).astype(np.uint8)
    # reflected soft shading: official cloth just inside the cut edge, mirrored across it, details removed + blurred
    clean = S[..., :3].astype(np.float32).copy()
    notcloth = ~cloth
    clean[notcloth] = np.broadcast_to(tone[:, None, :], clean.shape)[notcloth]
    clean = cv2.GaussianBlur(clean, (0, 0), 5)
    refl = np.empty_like(clean)
    cc = np.arange(W)[None, :].repeat(H, 0)
    src = np.clip(2 * cutc[:, None] - cc, 0, W - 1).astype(np.int32)
    src = np.maximum(src, (cutc[:, None] - 110).astype(np.int32))
    refl = np.take_along_axis(clean, src[..., None].repeat(3, 2), axis=1)
    w_ref = 0.7 * (1 - d)[..., None] + 0.35 * d[..., None]       # more official-like near the seam, calmer toward the rim
    init = np.clip(refl * w_ref + init.astype(np.float32) * (1 - w_ref), 0, 255).astype(np.uint8)
    G[gen_mask] = init[gen_mask]
    outside = ~T & ~A0
    G[outside] = init[outside]   # no white bg in the inpainter's context (it would bleach the seam)
    # (2) neural seam blend: LaMa re-synthesises a band across the official/tone seam from both sides (and the new rim)
    if use_lama and gen_mask.any():
        dist = cv2.distanceTransform((~A0).astype(np.uint8), cv2.DIST_L2, 3)
        band = (gen_mask & (dist < 22)).astype(np.uint8)
        rim = cv2.distanceTransform((~(~T)).astype(np.uint8), cv2.DIST_L2, 3) < 3          # inside-T pixels near the silhouette stay init
        step, win = 220, 300
        L = G.copy()  # (disabled by default: see README; LaMa bleaches this cloth)
        y = max(j0 - 30, 0)
        while y < j1:
            y1 = min(y + win, H); y0 = max(y1 - win, 0)
            if band[y0:y1].any():
                L = lama.fill_window(L, band, (0, y0, W, y1))
            y += step
        # LaMa is white-biased: keep only its structure (high-pass), the colour stays the sampled cloth tone
        lf = L.astype(np.float32); hp = lf - cv2.GaussianBlur(lf, (0, 0), 7)
        wband = cv2.GaussianBlur(band.astype(np.float32), (0, 0), 3)[..., None]
        G = np.clip(G.astype(np.float32) + hp * wband, 0, 255).astype(np.uint8)
    # outline along the new inner silhouette (rows with generated area) and along the cap
    Gs = np.dstack([G, np.where(T, 255, 0).astype(np.uint8)])
    line = np.zeros((H, W), np.uint8)
    pts = np.array([[c[j] + half_eff[j], j] for j in range(j0, j1 + 1)], np.float32)
    cv2.polylines(line, [np.round(pts).astype(np.int32)], False, 255, 2, cv2.LINE_AA)
    ptsl = np.array([[c[j] - half_eff[j], j] for j in range(j0, min(j0 + int(R) + 2, j1))], np.float32)
    cv2.polylines(line, [np.round(ptsl).astype(np.int32)], False, 255, 2, cv2.LINE_AA)
    la = (line.astype(np.float32) / 255) * (T.astype(np.float32)) * cv2.dilate(gen_mask.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32) * cov_in.astype(np.float32)
    Gf = Gs.copy().astype(np.float32)
    Gf[..., :3] = Gf[..., :3] * (1 - la[..., None] * 0.85) + np.array(OUTLINE, np.float32) * la[..., None] * 0.85
    G = Gf.astype(np.uint8)
    # composite official over generated (premultiplied-free)
    ao = A[..., None]; ag = (G[..., 3:4].astype(np.float32) / 255)
    ro = ao + ag * (1 - ao)
    col = (S[..., :3].astype(np.float32) * ao + G[..., :3].astype(np.float32) * ag * (1 - ao)) / np.maximum(ro, 1e-6)
    final = np.dstack([np.clip(col, 0, 255), np.clip(ro * 255, 0, 255)]).astype(np.uint8)
    # strap / cuff silhouette outline on the cut side (rows below the balloon), drawn on top
    cut_rows = range(int(js - 90), int(js + 40))
    ptsc = np.array([[inner[j] if False else c[j] + half[j], j] for j in cut_rows if 0 <= j < H], np.float32)
    # (kept off: the official strap end is cut by the panel hem; drawn only if requested)
    if flip:
        final = final[:, ::-1].copy(); S = S[:, ::-1].copy(); gen_mask = gen_mask[:, ::-1].copy()
    cv2.imwrite(str(out_dir / f'arm-{side}-complete.png'), final)
    cv2.imwrite(str(out_dir / f'arm-{side}-official.png'), S)
    cv2.imwrite(str(out_dir / f'arm-{side}-generated-mask.png'), gen_mask.astype(np.uint8) * 255)
    info = dict(side=side, gen_px=int(gen_mask.sum()), official_px=int(A0.sum()), rows=[int(j0), int(j1)], centre_pivot=float(ci_p), centre_strap=float(ci_s))
    print(info)
    return info

if __name__ == '__main__':
    use = '--lama' in sys.argv
    for s in ('l', 'r'): run(s, use)
