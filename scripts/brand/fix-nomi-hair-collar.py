#!/usr/bin/env python3
"""Restore the hair tips and the collar under the Nomi head from the official half-body art.

The first rig cut erased everything under the head and in-painted it, which left the hair
flat-cut at the bottom and the collar jagged. This one-shot script copies the official artwork
(docs/brand/reference/nomi-clean-halfbody.jpg, rig pixel = 2 x art pixel + (400, 0)) into the body
layers for the band below the chin: left and right of the neck, hair tips over the collar included.
Only crops of the official art are used (white background keyed out); no generative redraw.
The choker, neck and everything below the shoulder line (arm footprints) are untouched.

Usage: python3 scripts/brand/fix-nomi-hair-collar.py <official half-body jpg> <layers dir>
"""
import sys
import numpy as np, cv2
from PIL import Image

REF, LAY = sys.argv[1], sys.argv[2].rstrip('/') + '/'
BO = (66, 291)  # body layer origin in rig space
ref = Image.open(REF).convert('RGB').crop((400, 0, 880, 560)).resize((960, 1120), Image.LANCZOS)
ref = np.array(ref).astype(np.float32)

Y0, Y1 = 330, 432                      # band (rig space); arm footprints start at y = 429
ZONES = [(240, 436), (518, 712)]       # left / right of the neck skin


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def patch(name, y1):
    im = np.array(Image.open(LAY + name).convert('RGBA')).astype(np.float32)
    full = np.zeros((1120, 960, 4), np.float32)
    h, w = im.shape[:2]
    full[BO[1]:BO[1] + h, BO[0]:BO[0] + w] = im
    out = full.copy()
    for x0, x1 in ZONES:
        sl = (slice(Y0, y1), slice(x0, x1))
        e = ref[sl]
        white = e.min(axis=2)
        a = 1 - smooth(white, 226, 246)           # background white -> transparent
        # un-mix the white background from partly transparent pixels (no grey fringe)
        e = np.clip((e - 255.0 * (1 - a)[..., None]) / np.maximum(a, 0.08)[..., None], 0, 255)
        # soft feather at the zone borders and the bottom
        m = np.ones(a.shape, np.float32)
        fx = 6
        m[:, :fx] *= np.linspace(0, 1, fx)[None, :] if x0 != 240 else 1
        m[:, -fx:] *= np.linspace(1, 0, fx)[None, :] if x1 != 712 else 1
        fb = 8
        m[-fb:, :] *= np.linspace(1, 0, fb)[:, None]
        m[:30, :] *= np.linspace(0, 1, 30)[:, None] ** 2
        # keep opaque pixels of the original where the art keyed to transparent but the body had
        # real (non-collar) content: jacket outline at the bottom band
        old = full[sl]
        ya = old[..., 3] / 255.0
        yy = np.arange(Y0, y1)[:, None]
        keep_old = smooth(yy, 410, 424) * ya       # lower band: trust the old pixels as alpha floor
        na = np.maximum(a, keep_old)
        newrgb = np.where((a > 0.02)[..., None], e, old[..., :3])
        res = np.concatenate([newrgb, (na * 255)[..., None]], axis=2)
        # blend in premultiplied space (straight-alpha mixing with transparent black leaves grey fringes)
        pa_old = old[..., 3:4] / 255.0
        pa_new = res[..., 3:4] / 255.0
        mm = m[..., None]
        pm = old[..., :3] * pa_old * (1 - mm) + res[..., :3] * pa_new * mm
        aa = pa_old * (1 - mm) + pa_new * mm
        rgb = np.where(aa > 1e-4, pm / np.maximum(aa, 1e-4), 0)
        out[sl] = np.concatenate([np.clip(rgb, 0, 255), aa * 255], axis=2)
    sub = out[BO[1]:BO[1] + h, BO[0]:BO[0] + w]
    Image.fromarray(np.clip(sub + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(LAY + name, optimize=True)


patch('body.png', Y1)
patch('body-noarm.png', Y1)
print('patched body layers')


def fade_bottom(name, rows=16):
    """The side-hair pieces end in a hard cut; fade their last rows out so the official hair tips
    underneath (now in the body layer) take over without a visible edge."""
    im = np.array(Image.open(LAY + name).convert('RGBA'))
    a = im[..., 3].astype(np.float32)
    last = int(np.nonzero((a > 20).sum(axis=1) > 20)[0].max())
    for i in range(rows):
        y = last - i
        a[y] *= i / rows
    a[last + 1:] = 0
    im[..., 3] = a.astype(np.uint8)
    Image.fromarray(im, 'RGBA').save(LAY + name, optimize=True)


if '--no-fade' not in sys.argv:
    fade_bottom('hair-side-l.png')
    fade_bottom('hair-side-r.png')
    print('faded side hair bottoms')


def fade_head_cut(name='head.png', ox=264.12, oy=70.8, sc=0.66, y_cut=367.1, span=16):
    """The head piece also ends in a flat cut beside the neck; fade it out over the official hair."""
    im = np.array(Image.open(LAY + name).convert('RGBA'))
    a = im[..., 3].astype(np.float32)
    h, w = a.shape
    ys = (oy + np.arange(h) * sc)[:, None]
    xs = (ox + np.arange(w) * sc)[None, :]
    fy = np.clip((y_cut - ys) / span, 0, 1)                     # 1 above, 0 at the cut
    fy = np.where(ys > y_cut + 0.5, 0.0, fy)
    wx = smooth(np.abs(xs - 480), 68, 82)                       # 0 over the neck, 1 outside it
    # only the flat part: stop at the neck-side corner (below the cut stays for the neck)
    f = 1 - wx * (1 - fy)
    # the cut rows beyond the neck sides only (neck piece reaches y 409)
    a = a * np.where((ys > y_cut - span) & (wx > 0), f, 1.0)
    # below the cut the head piece only keeps the neck skin (its collar bits are replaced above)
    a = a * np.where(ys > y_cut + 0.5, 1 - smooth(np.abs(xs - 480), 44, 56), 1.0)
    im[..., 3] = np.clip(a, 0, 255).astype(np.uint8)
    Image.fromarray(im, 'RGBA').save(LAY + name, optimize=True)


if '--no-fade' not in sys.argv:
    fade_head_cut()
    print('faded head flat cut')
