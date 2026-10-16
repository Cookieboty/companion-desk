#!/usr/bin/env python3
"""Cut the official sleeve layers (layers/arm-l.png, arm-r.png) into an upper-arm and a forearm piece.

The cut is a straight line across the sleeve axis at the elbow (spine arc length ARM_ELBOW_S, see
packages/renderer/src/mascot/rig/armKin.ts), in the ORIGINAL orientation of the master layer, so
upper + forearm composited at their stored offsets reproduce the master pixel for pixel.
Nothing is repainted: every pixel comes from the official art (brand lock: pixel-cut only).

  python3 scripts/brand/build-nomi-arm-pieces.py [--check]

Output: layers/arms/arm-{r,l}-{upper,fore}.png (cropped to their bbox) and the placement
(offset in master-layer px, elbow joint, axis) that scripts/brand/build-nomi-parts-manifest.mjs
copies into parts.json `arms.<side>.pieces`.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'packages/renderer/public/assets/models/sprite/nomi'
ELBOW_S = 380  # == ARM_ELBOW_S in armKin.ts


def cut(side: str, geom: dict):
    src = Image.open(MODEL / f'layers/arm-{side}.png').convert('RGBA')
    a = np.array(src)
    h, w = a.shape[:2]
    th, sgn = geom['theta'], geom['sgn']
    ux, uy = sgn * math.sin(th), math.cos(th)  # rest axis
    ys, xs = np.mgrid[0:h, 0:w]
    s = (xs + 0.5 - geom['s0'][0]) * ux + (ys + 0.5 - geom['s0'][1]) * uy
    out = {}
    for name, m in (('upper', s < ELBOW_S), ('fore', s >= ELBOW_S)):
        piece = a.copy()
        piece[~m] = 0
        alpha = piece[..., 3]
        yy, xx = np.where(alpha > 0)
        x0, x1, y0, y1 = int(xx.min()), int(xx.max()) + 1, int(yy.min()), int(yy.max()) + 1
        out[name] = (Image.fromarray(piece[y0:y1, x0:x1]), [x0, y0])
    # elbow joint on the axis, in master-layer px
    ex = geom['s0'][0] + ux * ELBOW_S
    ey = geom['s0'][1] + uy * ELBOW_S
    return out, [round(ex, 2), round(ey, 2)], (w, h)


def main():
    check = '--check' in sys.argv
    arms = json.loads((MODEL / 'manifest.json').read_text())['rig']['arms']
    meta = {}
    (MODEL / 'layers/arms').mkdir(exist_ok=True)
    for side, geom in arms.items():
        pieces, elbow, size = cut(side, geom)
        meta[side] = {'elbow': elbow, 'elbowS': ELBOW_S, 'layerSize': list(size)}
        for name, (im, off) in pieces.items():
            f = MODEL / f'layers/arms/arm-{side}-{name}.png'
            meta[side][name] = {'file': f'layers/arms/arm-{side}-{name}.png', 'offset': off, 'size': list(im.size)}
            if check:
                if not f.exists() or np.any(np.array(Image.open(f).convert('RGBA')) != np.array(im)):
                    print(f'{f} is stale', file=sys.stderr)
                    sys.exit(1)
            else:
                im.save(f, optimize=True)
    (MODEL / 'layers/arms/pieces.json').write_text(json.dumps(meta, indent=2) + '\n') if not check else None
    print('arm pieces ok' if check else 'wrote layers/arms/*.png')


main()
