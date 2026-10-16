"""Shared geometry for the Rive 'complete parts' prototype (rig space = 960x1120 px, same as parts.json)."""
from __future__ import annotations
import json, math
from pathlib import Path
import cv2, numpy as np

ROOT = Path(__file__).resolve().parents[2]
OFFICIAL = ROOT / 'rive/nomi-complete/official'
LAYERS = OFFICIAL / 'layers'
PARTS = ROOT / 'rive/nomi-complete/parts'
DRAFT = ROOT / 'docs/brand/reference/nomi-clean-halfbody.jpg'
PJ = json.loads((OFFICIAL / 'parts.json').read_text())
RIGSZ = tuple(PJ['rigSize'])

# draft jpg (1280x720) -> rig px: rig = BODY_OFF + 2*(jpg - JPG_ORIGIN)   (found by template matching body.png, scale 0.5)
JPG_ORIGIN = (433.0, 145.0)
BODY_OFF = (66.0, 291.0)
JPG_K = 2.0

def jpg_to_rig(x, y): return (BODY_OFF[0] + JPG_K * (x - JPG_ORIGIN[0]), BODY_OFF[1] + JPG_K * (y - JPG_ORIGIN[1]))
def rig_to_jpg(x, y): return (JPG_ORIGIN[0] + (x - BODY_OFF[0]) / JPG_K, JPG_ORIGIN[1] + (y - BODY_OFF[1]) / JPG_K)

def load_rgba(path):
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 3: im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    return im

def arm_geom(side):
    g = PJ['arms'][side]
    lay = next(p for p in PJ['parts'] if p['id'] == g['layer'])
    th = g['theta']; sg = g['sgn']
    u = (sg * math.sin(th), math.cos(th)); w = (math.cos(th), -sg * math.sin(th))
    off = lay['offset']
    s0 = (off[0] + g['s0'][0], off[1] + g['s0'][1])
    pivot = lay['pivot']
    return dict(side=side, g=g, sg=sg, th=th, u=u, w=w, off=off, s0=s0, pivot=pivot, layer=g['layer'])

def spine(a, s, n=0.0):
    return (a['s0'][0] + s * a['u'][0] + n * a['w'][0], a['s0'][1] + s * a['u'][1] + n * a['w'][1])

# straight arm texture frame: texture px (i, j) <-> (n, s) = (n0 + i, s0 + j)
TEX_N0, TEX_N1 = -150, 150
TEX_S0, TEX_S1 = -140, 860

def tex_to_rig_affine(a):
    """2x3 matrix mapping texture px (i,j) -> rig px (x,y)"""
    return np.array([[a['w'][0], a['u'][0], a['s0'][0] + TEX_N0 * a['w'][0] + TEX_S0 * a['u'][0]],
                     [a['w'][1], a['u'][1], a['s0'][1] + TEX_N0 * a['w'][1] + TEX_S0 * a['u'][1]]], np.float64)

def rig_canvas_to_straight(img_rig, a, interp=cv2.INTER_CUBIC):
    """img_rig: image in RIG space (RIGSZ w x h). returns straight-arm texture."""
    M = tex_to_rig_affine(a)
    return cv2.warpAffine(img_rig, M, (TEX_N1 - TEX_N0, TEX_S1 - TEX_S0), flags=interp | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))

def straight_to_rig(tex, a, interp=cv2.INTER_CUBIC):
    M = tex_to_rig_affine(a)
    return cv2.warpAffine(tex, M, RIGSZ, flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))

def layer_in_rig(name_or_part):
    p = next(p for p in PJ['parts'] if p['id'] == name_or_part)
    im = load_rgba(OFFICIAL / p['file'])
    canvas = np.zeros((RIGSZ[1], RIGSZ[0], 4), np.uint8)
    x, y = int(round(p['offset'][0])), int(round(p['offset'][1]))
    h, w = im.shape[:2]
    x0, y0 = max(x, 0), max(y, 0); x1, y1 = min(x + w, RIGSZ[0]), min(y + h, RIGSZ[1])
    canvas[y0:y1, x0:x1] = im[y0 - y:y1 - y, x0 - x:x1 - x]
    return canvas

def over(bg_rgb, fg_rgba):
    a = fg_rgba[..., 3:4].astype(np.float32) / 255
    return (bg_rgb.astype(np.float32) * (1 - a) + fg_rgba[..., :3].astype(np.float32) * a).astype(np.uint8)
