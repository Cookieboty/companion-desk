#!/usr/bin/env python3
"""contact-sheet.py <dir> <out.png> [prefix]  —— 把目录下的 png 按文件名排成网格（动画巡检用）"""
import sys, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
pre = sys.argv[3] if len(sys.argv) > 3 else ''
files = sorted(f for f in os.listdir(d) if f.endswith('.png') and f.startswith(pre) and 'sheet' not in f)
if not files: sys.exit('no images')
W, H, cols = 180, 300, 8
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * (H + 16)), (40, 44, 52))
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(os.path.join(d, f)).convert('RGBA')
    im.thumbnail((W, H))
    x, y = (i % cols) * W, (i // cols) * (H + 16)
    bg = Image.new('RGBA', im.size, (90, 96, 110, 255)); bg.alpha_composite(im)
    sheet.paste(bg.convert('RGB'), (x + (W - im.width) // 2, y))
    dr.text((x + 3, y + H + 2), f[:-4][-28:], fill=(230, 230, 230))
sheet.save(out)
print(out, len(files))
