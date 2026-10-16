import vtracer, re, sys, time, json
import numpy as np
from PIL import Image
import cairosvg, io
from svgpathtools import parse_path
src = Image.open('hand-wave.png').convert('RGBA'); W,H = src.size
# composite on flat bg for comparison
def comp(im):
    bg = Image.new('RGBA', im.size, (60,64,80,255)); bg.alpha_composite(im); return bg.convert('RGB')
ref = np.asarray(comp(src)).astype(float)
def stats(svg):
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    nseg=0; npts=0
    for d in paths:
        p = parse_path(d); nseg += len(p)
        # control points count: each cubic = 3 pts
        npts += sum(3 if s.__class__.__name__=='CubicBezier' else 1 for s in p)
    return len(paths), nseg, npts
res=[]
presets = {
 'fine':   dict(colormode='color', hierarchical='stacked', mode='spline', filter_speckle=2, color_precision=7, layer_difference=8, corner_threshold=60, length_threshold=3.0, splice_threshold=45, path_precision=2),
 'medium': dict(colormode='color', hierarchical='stacked', mode='spline', filter_speckle=4, color_precision=6, layer_difference=16, corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=2),
 'coarse': dict(colormode='color', hierarchical='stacked', mode='spline', filter_speckle=8, color_precision=5, layer_difference=32, corner_threshold=60, length_threshold=6.0, splice_threshold=45, path_precision=2),
 'xcoarse':dict(colormode='color', hierarchical='stacked', mode='spline', filter_speckle=16, color_precision=4, layer_difference=48, corner_threshold=60, length_threshold=8.0, splice_threshold=45, path_precision=2),
}
# vtracer needs opaque-ish input; it supports RGBA png directly
for name, kw in presets.items():
    t=time.time(); svg = vtracer.convert_raw_image_to_svg(open('hand-wave.png','rb').read(), img_format='png', **kw); dt=time.time()-t
    open(f'hand-wave-{name}.svg','w').write(svg)
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=W, output_height=H)
    out = Image.open(io.BytesIO(png)).convert('RGBA'); out.save(f'hand-wave-{name}.png')
    o = np.asarray(comp(out)).astype(float)
    mae = np.abs(o-ref).mean(); 
    a_ref = np.asarray(src)[...,3]>127; a_out = np.asarray(out)[...,3]>127
    iou = (a_ref&a_out).sum()/max(1,(a_ref|a_out).sum())
    n,seg,pts = stats(svg)
    r=dict(name=name, paths=n, segments=seg, ctrl_points=pts, svg_kb=round(len(svg)/1024,1), mae=round(mae,2), alpha_iou=round(iou,4), secs=round(dt,2)); res.append(r); print(r)
json.dump(res, open('vtracer-stats.json','w'), indent=1)
