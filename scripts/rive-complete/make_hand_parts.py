#!/usr/bin/env python3
"""Hand pieces for the complete-parts rig: the existing generated hand/forearm art (layers/hands, AI-made earlier by the project,
NOT brand art) cropped ABOVE their own plain white cuff so that only wrist + hand remain. The forearm texture supplies the
official cuff (black strap, white cuff, orange lining) and the hand comes out of its opening.
Writes rive/nomi-complete/parts/hand-{rest,wave,fist}.png + hands.json (anchor = bottom centre of the wrist stub)."""
import sys, json; sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from rc_common import *
CUT = {'rest': 295, 'wave': 375, 'fist': 205}     # row (px in the source art) where the wrist stub is cut, above the cuff rim
SIDE = {'rest': 'R', 'wave': 'L', 'fist': 'R'}    # native chirality of the art (parts.json hands[].side)
WRIST_TARGET = 48.0                                  # rig px: wrist width that fits the orange cuff opening (80 px)
meta = {}
PARTS.mkdir(parents=True, exist_ok=True)
for n, cut in CUT.items():
    im = load_rgba(LAYERS / f'hands/hand-{n}.png')[:cut]
    al = im[..., 3] > 128
    xs = np.where(al[-6:].any(0))[0]
    ww = float(xs.max() - xs.min() + 1); cx = float((xs.max() + xs.min()) / 2)
    # fade the last 3 rows so the stub has no hard cut edge under the lining
    im = im.copy()
    cv2.imwrite(str(PARTS / f'hand-{n}.png'), im)
    meta[n] = dict(file=f'hand-{n}.png', w=int(im.shape[1]), h=int(im.shape[0]), ax=cx, ay=float(im.shape[0]), wristW=ww,
                   scale=round(WRIST_TARGET / ww, 4), side=SIDE[n], source=f'official/layers/hands/hand-{n}.png rows 0..{cut}')
    print(n, meta[n])
(PARTS / 'hands.json').write_text(json.dumps(meta, indent=1))
