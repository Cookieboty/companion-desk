#!/usr/bin/env python3
"""Crop + colour-match the keyed AI arm art (parts/ai/gen-*.png, from key_gen.py) into pose-state arm textures.
States: hang (rest), bent (wave elbow), up (cheer).  Screen-right arm ('r' = character's LEFT arm) = art as drawn;
the screen-left arm ('l') = horizontal mirror (cv2.flip) with joints mirrored.  Native resolution, no resampling.
Joint estimates (shoulder S / elbow E / wrist W = cuff centre) are in 1024-wide preview px *1.25 = native px."""
import json, sys
from pathlib import Path
import numpy as np, cv2
ROOT = Path(__file__).resolve().parents[2]
AI = ROOT / 'rive/nomi-complete/parts/ai'; PREV = Path('/workspace/screenshots/nomi-rive-complete/r3-ai-parts'); PREV.mkdir(parents=True, exist_ok=True)
K = 1.25
STATES = {
  'hang': ('gen-arm-hang',      dict(S=(507, 58),  E=(509, 232), W=(511, 407))),
  'bent': ('gen-arm-wave-bent', dict(S=(300, 425), E=(548, 448), W=(584, 277))),
  'up':   ('gen-arm-cheer-up',  dict(S=(487, 576), E=(520, 392), W=(541, 213))),
}
def color_match(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    f = bgr.astype(np.float32)
    # white / light grey sleeve: official white point is warm (250,236,229), the AI art is neutral (253,253,253)
    ww = np.clip((v - 120) / 100, 0, 1) * np.clip(1 - s / 70, 0, 1)
    gain = np.array([229 / 253, 236 / 253, 250 / 253], np.float32)   # BGR order
    f = f * (1 + (gain - 1) * ww[..., None])
    # orange lining: official ~ (240,142,72) pastel-ish, AI ~ (228,88,8) fully saturated
    orw = np.clip((s - 100) / 60, 0, 1) * ((h > 3) & (h < 26))
    hsv2 = cv2.cvtColor(np.clip(f, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv2[..., 1] = hsv2[..., 1] * (1 - orw * 0.28)
    hsv2[..., 2] = np.minimum(255, hsv2[..., 2] * (1 + orw * 0.06))
    hsv2[..., 0] = hsv2[..., 0] + orw * 1.2
    f = cv2.cvtColor(hsv2.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
    # near-black cuff / strap: official is warm black (51,40,36), AI cool (37,41,42)
    dw = np.clip(1 - v / 110, 0, 1) * np.clip(1 - s / 120, 0, 1) * (1 - orw)
    f = f * (1 + (np.array([36 / 42, 40 / 41, 51 / 37], np.float32) - 1) * dw[..., None] * 0.9)
    # skin: official hand (254,227,211) vs AI (252,233,216)
    sk = ((h > 3) & (h < 25) & (s > 20) & (s < 120) & (v > 170)).astype(np.float32)
    sk = cv2.GaussianBlur(sk, (0, 0), 1.0)
    f = f * (1 + (np.array([211 / 216, 227 / 233, 254 / 252], np.float32) - 1) * sk[..., None])
    return np.clip(f, 0, 255).astype(np.uint8)
def crop(name, a):
    H, W = a.shape; yy, xx = np.mgrid[0:H, 0:W]; x = xx / K; y = yy / K
    if name == 'bent':   # drop shoulder cap / hood lining / chest pocket (torso layers stay official); feathered vertical cut
        keep = np.clip((x - 235) / 5.0, 0, 1)
    elif name == 'up':   # drop pocket / hood piece at lower-left
        keep = np.where(y > 440, np.clip((x - 394) / 5.0, 0, 1), 1.0)
    else: keep = np.ones_like(x)
    return (a.astype(np.float32) * keep).astype(np.uint8)
meta = {}
for st, (src, jn) in STATES.items():
    im = cv2.imread(str(AI / f'{src}.png'), cv2.IMREAD_UNCHANGED)
    a = crop(st, im[..., 3]); bgr = color_match(im[..., :3])
    out = np.dstack([bgr, a]); out[a == 0, :3] = 0
    Wd = out.shape[1]
    J = {k: (v[0] * K, v[1] * K) for k, v in jn.items()}
    cv2.imwrite(str(AI / f'arm-{st}-r.png'), out)
    cv2.imwrite(str(AI / f'arm-{st}-l.png'), cv2.flip(out, 1))
    meta[st] = dict(src=f'{src}.jpg', size=[Wd, out.shape[0]], r={k: list(v) for k, v in J.items()},
                    l={k: [Wd - v[0], v[1]] for k, v in J.items()})
    bg = np.full(out.shape[:2] + (3,), (232, 239, 246), np.uint8); al = a[..., None].astype(np.float32) / 255
    pv = (bgr * al + bg * (1 - al)).astype(np.uint8)
    pts = [J['S'], J['E'], J['W']]
    for p, c in zip(pts, ((0, 0, 255), (0, 160, 0), (255, 0, 0))): cv2.circle(pv, (int(p[0]), int(p[1])), 9, c, -1)
    cv2.polylines(pv, [np.array(pts, np.int32)], False, (0, 0, 0), 2)
    cv2.imwrite(str(PREV / f'ai-state-{st}-joints.png'), cv2.resize(pv, (Wd // 2, out.shape[0] // 2)))
(AI / 'ai_arms.json').write_text(json.dumps(meta, indent=1))
print('ok', {k: v['size'] for k, v in meta.items()})
