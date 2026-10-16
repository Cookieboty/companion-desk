#!/usr/bin/env python3
"""Cut the official sleeve layers into upper-arm, forearm and elbow-cap pieces.

Cuts are in the ORIGINAL orientation of the master layer so upper + forearm (ignoring the
feathered overlap) composite back to the master pixel-for-pixel. Every pixel comes from the
official art (brand lock: pixel-cut only, no repaint).

  python3 scripts/brand/build-nomi-arm-pieces.py [--check]

Outputs under packages/renderer/public/assets/models/sprite/nomi/layers/arms/:
  arm-{r,l}-upper.png   shoulder → elbow + OVERLAP (feathered distal edge)
  arm-{r,l}-fore.png    elbow − OVERLAP → cuff (feathered proximal edge)
  arm-{r,l}-elbow.png   outer-elbow cap (used to fill the outer hinge gap on a bend)
  pieces.json           offsets, elbow joint, overlap, sizes
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'packages/renderer/public/assets/models/sprite/nomi'
# Keep in sync with packages/renderer/src/mascot/rig/armKin.ts
ELBOW_S = 320
HAND_S = 560
OVERLAP = 28  # px of feathered overlap — keep hinge sharp (was 56)


def feather(alpha: np.ndarray, dist: np.ndarray, lo: float, hi: float, into: str) -> np.ndarray:
    """Multiply alpha by a smooth ramp between lo..hi along `dist`. into='hi' fades toward hi."""
    t = np.clip((dist - lo) / max(1e-6, hi - lo), 0, 1)
    t = t * t * (3 - 2 * t)
    if into == 'hi':
        return (alpha * (1 - t)).astype(np.uint8)
    return (alpha * t).astype(np.uint8)


def cut(side: str, geom: dict):
    src = Image.open(MODEL / f'layers/arm-{side}.png').convert('RGBA')
    a = np.array(src)
    h, w = a.shape[:2]
    th, sgn = geom['theta'], geom['sgn']
    ux, uy = sgn * math.sin(th), math.cos(th)
    # lateral (outer = + for r when we want the side away from body for a hanging arm:
    # w0 = (cosθ, -sgn·sinθ); body is toward -sgn in x, so outer is +n for sgn=+1? 
    # For hanging arm, body is inward (-sgn in screen x). Outer elbow for positive bend
    # (forearm swings outward) is the +n side for sgn=+1.)
    wx, wy = math.cos(th), -sgn * math.sin(th)
    ys, xs = np.mgrid[0:h, 0:w]
    s = (xs + 0.5 - geom['s0'][0]) * ux + (ys + 0.5 - geom['s0'][1]) * uy
    n = (xs + 0.5 - geom['s0'][0]) * wx + (ys + 0.5 - geom['s0'][1]) * wy
    out = {}

    # --- upper: s < ELBOW + OVERLAP, feather out toward distal
    upper = a.copy()
    keep = s < ELBOW_S + OVERLAP
    upper[~keep] = 0
    upper[..., 3] = feather(upper[..., 3], s, ELBOW_S + OVERLAP * 0.15, ELBOW_S + OVERLAP, 'hi')
    # --- fore: s > ELBOW - OVERLAP, feather in from proximal
    fore = a.copy()
    keep = s > ELBOW_S - OVERLAP
    fore[~keep] = 0
    fore[..., 3] = feather(fore[..., 3], s, ELBOW_S - OVERLAP, ELBOW_S - OVERLAP * 0.15, 'lo')
    # Hard OUTER hinge cut: on the outer half of the sleeve, end upper and start fore
    # at the elbow so a high bend cannot fan rest-pose material into a rubber-hose balloon.
    # Inner half still overlaps (upper over fore) to seal the crook.
    outer = n * sgn
    # upper: kill distal outer beyond the elbow
    outer_w = np.clip(outer / 35, 0, 1)
    kill_u = np.clip((s - (ELBOW_S - 2)) / 22, 0, 1) * outer_w
    kill_u = kill_u * kill_u * (3 - 2 * kill_u)
    upper[..., 3] = (upper[..., 3].astype(np.float64) * (1 - kill_u)).astype(np.uint8)
    # fore: kill proximal outer before the elbow
    kill_f = np.clip(((ELBOW_S + 2) - s) / 22, 0, 1) * outer_w
    kill_f = kill_f * kill_f * (3 - 2 * kill_f)
    fore[..., 3] = (fore[..., 3].astype(np.float64) * (1 - kill_f)).astype(np.uint8)

    # --- elbow cap: outer crescent around the elbow (fills the OUTER hinge gap on a bend)
    # Slightly larger + stronger outer bias so the hinge silhouette reads as a sharp anime fold.
    cap = a.copy()
    outer = n * sgn  # recompute; fore bevel above also uses outer
    band = (np.abs(s - ELBOW_S) < 90) & (outer > -4)
    cap[~band] = 0
    fade_s = np.clip(1 - np.abs(s - ELBOW_S) / 90, 0, 1)
    fade_s = fade_s * fade_s * (3 - 2 * fade_s)
    fade_n = np.clip((outer + 4) / 55, 0, 1)
    fade_n = fade_n * fade_n * (3 - 2 * fade_n)
    cap[..., 3] = (cap[..., 3].astype(np.float64) * fade_s * fade_n).astype(np.uint8)

    for name, piece in (('upper', upper), ('fore', fore), ('elbow', cap)):
        alpha = piece[..., 3]
        yy, xx = np.where(alpha > 0)
        if len(xx) == 0:
            raise SystemExit(f'{side}.{name}: empty cut')
        x0, x1, y0, y1 = int(xx.min()), int(xx.max()) + 1, int(yy.min()), int(yy.max()) + 1
        out[name] = (Image.fromarray(piece[y0:y1, x0:x1]), [x0, y0])

    ex = geom['s0'][0] + ux * ELBOW_S
    ey = geom['s0'][1] + uy * ELBOW_S
    hx = geom['s0'][0] + ux * HAND_S
    hy = geom['s0'][1] + uy * HAND_S
    return out, [round(ex, 2), round(ey, 2)], [round(hx, 2), round(hy, 2)], (w, h)


def main():
    check = '--check' in sys.argv
    arms = json.loads((MODEL / 'manifest.json').read_text())['rig']['arms']
    meta = {}
    (MODEL / 'layers/arms').mkdir(exist_ok=True)
    for side, geom in arms.items():
        pieces, elbow, hand, size = cut(side, geom)
        entry = {
            'joint': elbow,
            'handJoint': hand,
            'elbowS': ELBOW_S,
            'handS': HAND_S,
            'overlap': OVERLAP,
            'layerSize': list(size),
            'pieces': {},
        }
        for name, (im, off) in pieces.items():
            f = MODEL / f'layers/arms/arm-{side}-{name}.png'
            info = {
                'file': f'layers/arms/arm-{side}-{name}.png',
                'offset': off,
                'size': list(im.size),
            }
            entry['pieces'][name] = info
            entry[name] = info
            if check:
                if not f.exists() or np.any(np.array(Image.open(f).convert('RGBA')) != np.array(im)):
                    print(f'{f} is stale', file=sys.stderr)
                    sys.exit(1)
            else:
                im.save(f, optimize=True)
        meta[side] = entry
    if not check:
        (MODEL / 'layers/arms/pieces.json').write_text(json.dumps(meta, indent=2) + '\n')
    print('arm pieces ok' if check else 'wrote layers/arms/*.png (upper/fore/elbow)')


if __name__ == '__main__':
    main()
