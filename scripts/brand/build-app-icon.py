#!/usr/bin/env python3
"""
Nomi 应用图标（原创矢量，MIT）：流畅曲线 N + 橙色四角星光，配色 #FB9466 / 奶油 / 深棕。
生成 SVG 变体到 docs/brand/icon-variants/；栅格化见 scripts/brand/render-icons.mjs。

- macOS：Apple 图标网格——1024 画布内 824×824 的连续曲率圆角矩形（superellipse，n≈5），
  四周留 100px 透明边，系统投影由 macOS 自己画（这里只画极淡的内阴影 / 渐变）。
- Windows / Linux：同一图形铺满（圆角 22%），小尺寸（≤32px）用加粗笔画的「小号」版本。
"""
import math
import os
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else 'docs/brand/icon-variants'

BROWN = '#33291F'
CREAM = '#FFF6EC'
ORANGE = '#FB9466'

VARIANTS = {
    # 名称: (背景渐变上, 背景渐变下, N 颜色, 星光颜色, 描边高光)
    'cream': ('#FFFAF4', '#F6E6D4', BROWN, ORANGE),
    'ink': ('#43362B', '#1F1813', CREAM, ORANGE),
    'sunset': ('#FDAA82', '#F07E4C', CREAM, BROWN),
}


def squircle(x, y, size, n=5.0, steps=256):
    """连续曲率圆角矩形（|x|^n + |y|^n = 1），比普通圆角更接近 macOS 图标形状"""
    a = size / 2
    cx, cy = x + a, y + a
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        px = cx + a * math.copysign(abs(c) ** (2 / n), c)
        py = cy + a * math.copysign(abs(s) ** (2 / n), s)
        pts.append(f'{px:.2f},{py:.2f}')
    return 'M' + ' L'.join(pts) + ' Z'


def sparkle(cx, cy, r, waist=0.16):
    """四角星：四个尖角用二次曲线收腰"""
    w = r * waist
    return (
        f'M{cx},{cy - r} Q{cx + w},{cy - w} {cx + r},{cy} '
        f'Q{cx + w},{cy + w} {cx},{cy + r} Q{cx - w},{cy + w} {cx - r},{cy} '
        f'Q{cx - w},{cy - w} {cx},{cy - r} Z'
    )


def mark(fg, star, x0, y0, s, small=False):
    """N 形流畅曲线：左腿上扬成圆拱 → 落到底 → 右侧再扬起，圆头收笔。坐标在 0..1 方框内"""
    sw = (0.205 if small else 0.165) * s
    P = lambda u, v: f'{x0 + u * s:.1f} {y0 + v * s:.1f}'
    d = (
        f'M{P(0.17, 0.80)} '
        f'C{P(0.17, 0.52)} {P(0.24, 0.30)} {P(0.38, 0.30)} '
        f'C{P(0.53, 0.30)} {P(0.52, 0.78)} {P(0.67, 0.78)} '
        f'C{P(0.78, 0.78)} {P(0.82, 0.66)} {P(0.82, 0.55)}'
    )
    star_r = (0.15 if small else 0.125) * s
    return (
        f'<path d="{d}" fill="none" stroke="{fg}" stroke-width="{sw:.1f}" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{sparkle(x0 + 0.80 * s, y0 + 0.24 * s, star_r)}" fill="{star}"/>'
    )


def svg(name, mac=True, small=False):
    top, bottom, fg, star = VARIANTS[name]
    if mac:
        x, size = 100, 824
        shape = f'<path d="{squircle(x, x, size)}" fill="url(#bg)"/>'
        hl = f'<path d="{squircle(x, x, size)}" fill="url(#sheen)"/>'
        rim = (
            f'<path d="{squircle(x + 1, x + 1, size - 2)}" fill="none" '
            f'stroke="#000" stroke-opacity="0.08" stroke-width="2"/>'
        )
    else:
        x, size = 0, 1024
        r = 1024 * 0.22
        shape = f'<rect width="1024" height="1024" rx="{r}" fill="url(#bg)"/>'
        hl = f'<rect width="1024" height="1024" rx="{r}" fill="url(#sheen)"/>'
        rim = ''
    pad = size * (0.10 if small else 0.14)
    body = mark(fg, star, x + pad, x + pad, size - 2 * pad, small)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>Nomi app icon ({name}{', mac grid' if mac else ''}{', small' if small else ''})</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{top}"/>
      <stop offset="1" stop-color="{bottom}"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.3" cy="0.12" r="0.9">
      <stop offset="0" stop-color="#fff" stop-opacity="0.18"/>
      <stop offset="0.6" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  {shape}
  {hl}
  {rim}
  {body}
</svg>
'''


def tray(template):
    """托盘：只有图形，无底板。mac 模板图为纯黑 + alpha（系统自动反色）"""
    fg = '#000000' if template else BROWN
    star = '#000000' if template else ORANGE
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  {mark(fg, star, 20, 20, 984, small=True)}
</svg>
'''


def tray_color():
    """Windows / Linux 托盘：小号满版图标（深浅任务栏都看得清）"""
    return svg('sunset', mac=False, small=True)


os.makedirs(OUT, exist_ok=True)
for v in VARIANTS:
    for mac in (True, False):
        for small in (False, True):
            if mac and small:
                continue
            suffix = ('-mac' if mac else '-flat') + ('-small' if small else '')
            with open(os.path.join(OUT, f'nomi-{v}{suffix}.svg'), 'w') as f:
                f.write(svg(v, mac, small))
with open(os.path.join(OUT, 'nomi-tray-template.svg'), 'w') as f:
    f.write(tray(True))
with open(os.path.join(OUT, 'nomi-tray-color.svg'), 'w') as f:
    f.write(tray_color())
print('wrote', sorted(os.listdir(OUT)))
