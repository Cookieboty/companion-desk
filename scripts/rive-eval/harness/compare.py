#!/usr/bin/env python3
"""compare.py ACTION OUT.png  -- rows: current canvas rig (top) vs Rive PoC CLI frames (bottom)"""
import sys
from PIL import Image, ImageDraw
act, out = sys.argv[1], sys.argv[2]
base = '/workspace/screenshots/nomi-rive-eval/base'
riv = '/workspace/screenshots/nomi-rive-eval/r2'
frs = [0, 20, 40, 60, 80, 110, 140, 170]
tw, th = 150, 175
S = Image.new('RGB', (len(frs) * tw, 2 * (th + 12)), (60, 64, 74))
d = ImageDraw.Draw(S)
for i, fr in enumerate(frs):
    b = Image.open(f'{base}/{act}-f{fr:03d}.png').convert('RGBA').resize((tw, th), Image.LANCZOS)
    r = Image.open(f'{riv}/{act}-f{fr:03d}.png').convert('RGBA')
    bg = Image.new('RGBA', r.size, (29, 29, 29, 255)); bg.alpha_composite(r); r = bg.resize((tw, th), Image.LANCZOS)
    bb = Image.new('RGBA', (tw, th), (90, 96, 110, 255)); bb.alpha_composite(b)
    S.paste(bb.convert('RGB'), (i * tw, 0)); S.paste(r.convert('RGB'), (i * tw, th + 12))
    d.text((i * tw + 3, th), f'canvas f{fr}', fill=(255, 255, 255)); d.text((i * tw + 3, 2 * th + 12), f'rive f{fr}', fill=(255, 255, 255))
S.save(out)
