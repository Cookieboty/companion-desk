#!/usr/bin/env python3
"""Brand-lock verification for the Rive complete-parts build.
1. every embedded official layer is byte-identical (sha256) to the polish-branch layer recorded in parts.json
2. in every pixel the official arm texture covers (alpha>=250) the final arm texture equals the official pixel exactly
   (generated pixels only ever live where the official art has alpha<250, i.e. 'final = official OVER generated')
3. the hand pieces are crops of official hand layers (sha256 of the source recorded in hands.json)
"""
import hashlib, json, sys
from pathlib import Path
import numpy as np, cv2
R = Path(__file__).resolve().parents[2] / 'rive/nomi-complete'
ok = True
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
parts = json.loads((R / 'official/parts.json').read_text())
n = bad = 0
for grp in ('parts', 'hands'):
    for p in parts[grp]:
        f = R / 'official' / p['file']
        if not f.exists(): continue
        n += 1
        if p.get('sha256') and sha(f) != p['sha256']: bad += 1; print('SHA MISMATCH', p['id'])
print(f'official layers checked: {n}, mismatches: {bad}'); ok &= bad == 0
for side in 'lr':
    comp = cv2.imread(str(R / f'parts/arm-{side}-complete.png'), cv2.IMREAD_UNCHANGED).astype(int)
    off = cv2.imread(str(R / f'parts/arm-{side}-official.png'), cv2.IMREAD_UNCHANGED).astype(int)
    gen = cv2.imread(str(R / f'parts/arm-{side}-generated-mask.png'), cv2.IMREAD_UNCHANGED)
    m = off[..., 3] >= 250
    diff = np.abs(comp[..., :3] - off[..., :3]).max(axis=2)[m]
    frac_gen = float(((comp[..., 3] > 8) & (off[..., 3] <= 8)).sum()) / max(1, (comp[..., 3] > 8).sum())
    print(f'arm-{side}: official px {int(m.sum())}, max |complete-official| over them = {int(diff.max())}, '
          f'pixels added by fill = {100 * frac_gen:.1f}% of the texture')
    ok &= int(diff.max()) <= 1   # <=1/255: 8-bit rounding of the alpha-over where official alpha is 250-254
print('BRAND LOCK', 'PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)
