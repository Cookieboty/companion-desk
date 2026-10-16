#!/usr/bin/env python3
"""Minimal SVG (vtracer output) -> RML converter for the Rive eval.

The Rive CLI cannot import SVG (SVGAsset is editor-only and stripped), so vector art has to be
turned into <Shape><PointsPath> with detached cubic vertices by hand. This is that bridge.
Usage: svg2rml.py in.svg out_scene.rml PNG_FOR_REFERENCE_NAME
Evaluation only: never use for brand-locked art (face, clip, N logo, badge, jacket ...).
"""
import math, re, sys
from xml.sax.saxutils import quoteattr
from svgpathtools import parse_path, CubicBezier, Line

def hexcolor(s):
    s = s.lstrip('#')
    return 'ff' + s.lower() if len(s) == 6 else 'ffffffff'

def path_to_vertices(d):
    p = parse_path(d)
    segs = list(p)
    if not segs:
        return []
    out = []
    n = len(segs)
    for i, s in enumerate(segs):
        prev = segs[i - 1]
        v = s.start
        if isinstance(s, CubicBezier):
            o = s.control1 - v
        else:
            o = (s.end - s.start) / 3 if isinstance(s, Line) else 0
        if isinstance(prev, CubicBezier):
            ih = prev.control2 - v
        else:
            ih = (prev.start - prev.end) / 3 if isinstance(prev, Line) else 0
        out.append((v.real, v.imag, ih, o))
    return out

def convert(svg, first_id=1000):
    items = re.findall(r'<path\s+d="([^"]+)"\s+fill="([^"]+)"(?:\s+transform="translate\(([-\d.]+),([-\d.]+)\)")?', svg)
    lines, nid, nv = [], first_id, 0
    for d, fill, tx, ty in items:
        verts = path_to_vertices(d)
        if len(verts) < 3:
            continue
        nv += len(verts)
        lines.append(f'<Shape name="p{nid}" x="{tx or 0}" y="{ty or 0}">')
        lines.append('  <PointsPath isClosed="true" isClockwise="true">')
        for x, y, ih, oh in verts:
            lines.append('    <CubicDetachedVertex x="%.2f" y="%.2f" inRotation="%.4f" inDistance="%.2f" outRotation="%.4f" outDistance="%.2f"/>' % (
                x, y, math.atan2(ih.imag, ih.real) if abs(ih) else 0, abs(ih), math.atan2(oh.imag, oh.real) if abs(oh) else 0, abs(oh)))
        lines.append('  </PointsPath>')
        lines.append(f'  <Fill><SolidColor colorValue="{hexcolor(fill)}"/></Fill>')
        lines.append('</Shape>')
        nid += 1
    return '\n'.join(lines), len(items), nv

if __name__ == '__main__':
    svg = open(sys.argv[1]).read()
    body, npaths, nv = convert(svg)
    open(sys.argv[2], 'w').write(body)
    print(f'paths={npaths} vertices={nv}', file=sys.stderr)
