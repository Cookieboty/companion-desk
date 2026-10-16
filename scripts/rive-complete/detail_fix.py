#!/usr/bin/env python3
"""Detail-fix pass for the six red-boxed failures.
GenerateImage (cursor MCP) is UNAVAILABLE in this executor; every patch below is cut/composited
from official pixels (draft jpg, official layers, existing hand/arm parts) + procedural tone fill.
Writes into rive/nomi-complete/parts/ and records provenance in parts/DETAIL_LICENSE.json.
"""
import json, hashlib
from pathlib import Path
import numpy as np, cv2
from PIL import Image
import sys
sys.path.insert(0, str(Path(__file__).parent))
from rc_common import *

OUT = PARTS
SHOT = Path('/workspace/screenshots/nomi-rive-complete/r2-detail-fix/gen')
SHOT.mkdir(parents=True, exist_ok=True)
prov = {}

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def save(name, rgba, note):
    p = OUT / name
    cv2.imwrite(str(p), rgba)
    # cream preview
    bg = np.full_like(rgba, 255); bg[...,0]=246; bg[...,1]=239; bg[...,2]=232
    a = rgba[...,3:4].astype(np.float32)/255
    prev = (rgba[...,:3].astype(np.float32)*a + bg[...,:3]*(1-a)).astype(np.uint8)
    Image.fromarray(prev[:,:,::-1]).save(SHOT / name.replace('.png','-preview.png'))
    prov[name] = dict(note=note, sha256=sha(p), w=int(rgba.shape[1]), h=int(rgba.shape[0]),
                      method='cut-restore-official+procedural', ai_generated=False)
    print('wrote', name, rgba.shape, note)

# ---------- 6: patch white holes in arm complete textures ----------
def patch_arm_holes(side):
    path = OUT / f'arm-{side}-complete.png'
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    off = cv2.imread(str(OUT / f'arm-{side}-official.png'), cv2.IMREAD_UNCHANGED)
    a = im[..., 3]
    # holes: low alpha surrounded by high alpha (interior holes only)
    solid = (a > 200).astype(np.uint8)*255
    filled = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((9,9), np.uint8))
    hole = (filled > 0) & (a < 40)
    # also thin low-alpha speckles inside solid
    speck = (filled > 0) & (a < 180) & (a > 0)
    # inpaint RGB where hole; build mask
    mask = (hole | speck).astype(np.uint8)*255
    # prefer official pixels where available
    use_off = (off[...,3] > 200) & (mask > 0)
    out = im.copy()
    out[use_off, :3] = off[use_off, :3]
    out[use_off, 3] = 255
    rem = (mask > 0) & ~use_off
    if rem.any():
        bgr = out[..., :3].copy()
        # cv2.inpaint needs 8-bit mask
        m2 = rem.astype(np.uint8)*255
        for c in range(3):
            ch = bgr[..., c]
            # telea inpaint
            bgr[..., c] = cv2.inpaint(ch, m2, 5, cv2.INPAINT_TELEA)
        out[rem, :3] = bgr[rem]
        out[rem, 3] = 255
    # smooth alpha at former hole edges
    out[..., 3] = np.maximum(out[..., 3], (filled > 0).astype(np.uint8)*255)
    # but keep exterior silhouette from original dilated slightly
    outer = cv2.dilate((a > 8).astype(np.uint8), np.ones((3,3), np.uint8))
    out[outer == 0, 3] = 0
    save(f'arm-{side}-complete.png', out, f'hole-patched from official+inpaint; holes_fixed={int(mask.sum())}')
    return int(mask.sum())

# ---------- 1: cuff-hand connector (skin stub tuck strip) ----------
def make_cuff_connectors():
    for hn, src in [('rest','hand-rest.png'), ('wave','hand-wave.png'), ('fist','hand-fist.png')]:
        im = cv2.imread(str(OUT / src), cv2.IMREAD_UNCHANGED)
        h, w = im.shape[:2]
        # sample skin near bottom wrist row
        ys = np.where(im[...,3] > 200)[0]
        if len(ys)==0: continue
        yb = min(h-1, int(np.percentile(ys, 92)))
        row = im[max(0,yb-8):yb]
        skin = row[row[...,3] > 200]
        if len(skin)==0: continue
        mean = skin[:, :3].mean(0)
        # extend wrist stub downward by 28 px of solid skin (tucks under orange lining)
        ext = 28
        out = np.zeros((h+ext, w, 4), np.uint8)
        out[:h] = im
        # find wrist width at bottom
        al = im[yb-2:yb+1, :, 3] > 128
        xs = np.where(al.any(0))[0]
        x0, x1 = int(xs.min()), int(xs.max())
        cx = (x0+x1)/2; half = (x1-x0)/2
        for i in range(ext):
            t = i/ext
            # slightly taper
            hw = half * (1 - 0.08*t)
            xx0, xx1 = int(cx-hw), int(cx+hw)
            # soft edge
            for x in range(max(0,xx0-2), min(w, xx1+3)):
                d = 0 if xx0 <= x <= xx1 else min(abs(x-xx0), abs(x-xx1))
                alpha = int(255 * max(0, 1 - d/3))
                # tiny noise
                noise = (np.random.RandomState(x*17+i).randn(3)*2).astype(np.float32)
                col = np.clip(mean + noise, 0, 255).astype(np.uint8)
                out[h+i, x, :3] = col
                out[h+i, x, 3] = alpha
        # rebuild hand with extended stub; update hands.json later
        save(f'hand-{hn}.png', out, f'wrist stub extended +{ext}px skin tuck under cuff; official hand pixels unchanged above')
    # rewrite hands.json anchors (ay = new height, ax = centre of new bottom)
    meta = json.loads((OUT/'hands.json').read_text())
    for hn in meta:
        im = cv2.imread(str(OUT/f'hand-{hn}.png'), cv2.IMREAD_UNCHANGED)
        al = im[...,3] > 128
        xs = np.where(al[-6:].any(0))[0]
        ww = float(xs.max()-xs.min()+1); cx = float((xs.max()+xs.min())/2)
        meta[hn].update(w=int(im.shape[1]), h=int(im.shape[0]), ax=cx, ay=float(im.shape[0]), wristW=ww,
                        scale=round(48.0/ww, 4), note='wrist-extended-for-cuff-tuck')
    (OUT/'hands.json').write_text(json.dumps(meta, indent=1))
    print('hands.json updated')

# ---------- 3: bent-elbow sleeve patch from warped official forearm+upper ----------
def make_elbow_patches():
    """Build a bent-elbow detail strip by folding the official straight sleeve around the elbow
    and painting soft crease shading sampled from official jacket white. Not AI."""
    for side in 'lr':
        arm = cv2.imread(str(OUT / f'arm-{side}-complete.png'), cv2.IMREAD_UNCHANGED)
        # elbow region in straight texture ≈ y 280..520 (TEX coords around S_ELBOW)
        # from make_arm: sE varies; approx mid
        y0, y1 = 260, 520
        strip = arm[y0:y1].copy()
        h, w = strip.shape[:2]
        # synthesize a crease: darken a diagonal band on the inner side, lighten outer fold ridge
        yy, xx = np.mgrid[0:h, 0:w]
        # inner edge is left for 'l' (after flip processing arm-r is character left...)
        # both textures are stored character-correct already in complete pngs
        # crease along mid, stronger toward inner (smaller x for r? inspect)
        # Use alpha centroid per row as spine
        crease = np.zeros((h,w), np.float32)
        for y in range(h):
            row = strip[y]
            xs = np.where(row[...,3] > 40)[0]
            if len(xs)<4: continue
            # inner = left half of sleeve for raised-arm inside fold
            mid = (xs.min()+xs.max())/2
            inner = xs.min() + 0.35*(xs.max()-xs.min())
            # gaussian valley at inner, ridge just outside
            for x in xs:
                d = (x - inner) / max(8, (xs.max()-xs.min())*0.25)
                crease[y,x] = -0.22*np.exp(-d*d) + 0.10*np.exp(-(d-0.9)**2)
        out = strip.astype(np.float32)
        for c in range(3):
            out[...,c] = np.clip(out[...,c] * (1+crease), 0, 255)
        out = out.astype(np.uint8)
        # fade top/bottom so it blends as an overlay
        fade = np.ones((h,1), np.float32)
        fade[:30,0] = np.linspace(0,1,30); fade[-30:,0] = np.linspace(1,0,30)
        out[...,3] = (out[...,3].astype(np.float32) * fade[:,0:1] * 0.92).astype(np.uint8)
        save(f'elbow-bent-patch-{side}.png', out, 'bent-elbow crease overlay from official sleeve pixels + procedural fold shading')

# ---------- 5: shoulder gusset L/R for raised arm ----------
def make_shoulder_gussets():
    """Composite official body-flank + sampled jacket white/orange lining into a raised-arm gusset."""
    draft = None
    for cand in [ROOT/'docs/brand/reference/nomi-clean-halfbody.jpg',
                 Path('/workspace/nomi-ref/user-halfbody-hd.png'),
                 Path('/workspace/nomi-2d-polish/docs/brand/reference/nomi-clean-halfbody.jpg')]:
        if cand.exists():
            draft = cv2.imread(str(cand), cv2.IMREAD_COLOR); break
    for side, flank_name in [('l','body-flank-l.png'), ('r','body-flank-r.png')]:
        flank = cv2.imread(str(OFFICIAL/'layers'/flank_name), cv2.IMREAD_UNCHANGED)
        arm = cv2.imread(str(OUT / f'arm-{side}-complete.png'), cv2.IMREAD_UNCHANGED)
        # sample jacket white & orange from arm texture (official cuff has orange)
        al = arm[...,3] > 200
        whites = arm[al & (arm[...,0] > 180) & (arm[...,1] > 180) & (arm[...,2] > 180)]
        oranges = arm[al & (arm[...,0] < 120) & (arm[...,1] > 80) & (arm[...,2] > 160)]  # BGR
        wcol = whites.mean(0)[:3] if len(whites)>50 else np.array([245,245,248], np.float32)
        ocol = oranges.mean(0)[:3] if len(oranges)>20 else np.array([40, 120, 255], np.float32)  # BGR orange-ish
        # canvas for gusset: tall underarm piece
        H, W = 280, 160
        g = np.zeros((H, W, 4), np.uint8)
        # shape: rounded triangle / gusset silhouette
        yy, xx = np.mgrid[0:H, 0:W]
        # left/right mirrored
        if side == 'r':
            # wide at top (shoulder), taper down
            edge = 20 + (W-40) * (1 - yy/H)**0.7
            inside = xx < edge
        else:
            edge = W-20 - (W-40) * (1 - yy/H)**0.7
            inside = xx > edge
        # orange lining on the "inside" half, white jacket on outside
        mid = W * (0.45 if side=='r' else 0.55)
        for y in range(H):
            for x in range(W):
                if not inside[y,x]: continue
                # soft alpha
                # distance to edge
                if side=='r':
                    t = x / max(1, edge[y,x])
                    is_orange = x < mid * (0.7 + 0.3*(1-y/H))
                else:
                    t = (W-1-x) / max(1, W-1-edge[y,x])
                    is_orange = x > mid * (0.7 + 0.3*(y/H)*0 + 0.9)
                    is_orange = x > (W - mid*(0.7+0.3*(1-y/H)))
                a = int(255 * min(1, max(0, (1-abs(t-0.5)*1.2))) * (0.55+0.45*(1-y/H)))
                if a < 8: continue
                col = ocol if is_orange else wcol
                # subtle vertical shading
                shade = 1 - 0.08*np.sin(y/18) - 0.05*(x/W)
                g[y,x,:3] = np.clip(col*shade, 0, 255).astype(np.uint8)
                g[y,x,3] = min(255, a)
        # stamp a strip of official flank pixels near the top for brand-lock jacket continuity
        fh, fw = flank.shape[:2]
        # take mid column band of flank
        band = flank[:, fw//4: 3*fw//4]
        bh, bw = band.shape[:2]
        scale = min(W/bw, 90/bh)
        nw, nh = max(1,int(bw*scale)), max(1,int(bh*scale))
        band_r = cv2.resize(band, (nw, nh), interpolation=cv2.INTER_AREA)
        xoff = (W-nw)//2; yoff = 8
        for y in range(nh):
            for x in range(nw):
                if band_r[y,x,3] < 40: continue
                yy_, xx_ = yoff+y, xoff+x
                if not (0<=yy_<H and 0<=xx_<W): continue
                # alpha-over onto gusset (official ON TOP)
                src_a = band_r[y,x,3]/255.0
                dst_a = g[yy_,xx_,3]/255.0
                out_a = src_a + dst_a*(1-src_a)
                if out_a < 1e-3: continue
                g[yy_,xx_,:3] = (band_r[y,x,:3]*src_a + g[yy_,xx_,:3]*dst_a*(1-src_a))/out_a
                g[yy_,xx_,3] = int(out_a*255)
        # thin dark outline on outer edge for cel look (sample from arm outline darkness)
        edge_mask = (g[...,3] > 40).astype(np.uint8)
        ring = cv2.dilate(edge_mask, np.ones((3,3),np.uint8)) - edge_mask
        g[ring>0] = (40, 40, 45, 200)
        save(f'shoulder-gusset-{side}-raised.png', g,
             'raised-arm gusset: official body-flank strip OVER procedural jacket white+orange lining sampled from arm texture')

# ---------- 4: crisp hand (unsharp + denser from official, no AI) ----------
def crisp_hands():
    for hn in ('wave','rest','fist'):
        im = cv2.imread(str(OUT / f'hand-{hn}.png'), cv2.IMREAD_UNCHANGED)
        rgb, a = im[...,:3], im[...,3]
        # unsharp on RGB where opaque
        blur = cv2.GaussianBlur(rgb, (0,0), 1.2)
        sharp = cv2.addWeighted(rgb, 1.45, blur, -0.45, 0)
        out = im.copy()
        m = a > 40
        out[m,:3] = sharp[m]
        # slightly boost edge alpha
        edges = cv2.Canny(a, 50, 150)
        out[...,3] = np.maximum(out[...,3], (cv2.dilate(edges, np.ones((2,2),np.uint8))>0).astype(np.uint8)*min(255,200))
        # restore fully transparent exterior
        out[a < 8, 3] = 0
        save(f'hand-{hn}.png', out, f'crisp unsharp of official hand-{hn} (no AI); wrist extension preserved if present')

if __name__ == '__main__':
    print('=== patch arm holes ===')
    for s in 'lr': patch_arm_holes(s)
    print('=== cuff connectors / wrist extend ===')
    make_cuff_connectors()
    print('=== crisp hands ===')
    crisp_hands()
    print('=== elbow patches ===')
    make_elbow_patches()
    print('=== shoulder gussets ===')
    make_shoulder_gussets()
    (OUT/'DETAIL_LICENSE.json').write_text(json.dumps({
        'note': 'GenerateImage MCP (cursor namespace) was unavailable; no AI-generated pixels. All detail-fix assets are cut/composited from official layers/draft + procedural tone.',
        'assets': prov,
    }, indent=2))
    print('DONE', len(prov), 'assets')
