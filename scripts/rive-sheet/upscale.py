#!/usr/bin/env python3
"""Real-ESRGAN (RealESRGAN_x4plus_anime_6B, ONNX, CPU via onnxruntime) tiled x4 upscaler + crop-set builder for the two character sheets.
Model: https://huggingface.co/deepghs/imgutils-models/resolve/main/real_esrgan/RealESRGAN_x4plus_anime_6B.onnx (sha256 2648cab4...b7f7).
Usage: python3 upscale.py [--model PATH]   (writes rive/nomi-sheet/crops/*)"""
import sys, json, time
from pathlib import Path
import numpy as np, cv2, onnxruntime as ort
ROOT = Path(__file__).resolve().parents[2]
SH = ROOT / 'rive/nomi-sheet'; CROPS = SH / 'crops'; CROPS.mkdir(parents=True, exist_ok=True)
MODEL = Path('/workspace/scratch/esr/esr6b.onnx')
sess = None
def esr_x4(bgr, tile=96, pad=10):
    global sess
    if sess is None:
        so = ort.SessionOptions(); so.intra_op_num_threads = 8
        sess = ort.InferenceSession(str(MODEL), so, providers=['CPUExecutionProvider'])
    h, w = bgr.shape[:2]; out = np.zeros((h * 4, w * 4, 3), np.float32)
    rgb = bgr[..., ::-1].astype(np.float32) / 255
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            y0, x0 = max(y - pad, 0), max(x - pad, 0); y1, x1 = min(y + tile + pad, h), min(x + tile + pad, w)
            t = np.ascontiguousarray(rgb[y0:y1, x0:x1].transpose(2, 0, 1)[None])
            r = sess.run(None, {'image.1': t})[0][0].transpose(1, 2, 0)
            ys, xs = (y - y0) * 4, (x - x0) * 4; th, tw = min(tile, h - y), min(tile, w - x)
            out[y * 4:(y + th) * 4, x * 4:(x + tw) * 4] = r[ys:ys + th * 4, xs:xs + tw * 4]
    return (np.clip(out, 0, 1)[..., ::-1] * 255).round().astype(np.uint8)
def up_rgba(rgba):
    a = rgba[..., 3].astype(np.float32) / 255
    bg = np.full(rgba.shape[:3 - 0][:2] + (3,), 244, np.float32)
    comp = (rgba[..., :3].astype(np.float32) * a[..., None] + bg * (1 - a[..., None])).astype(np.uint8)
    rgb = esr_x4(comp)
    A = cv2.resize(a, (a.shape[1] * 4, a.shape[0] * 4), interpolation=cv2.INTER_CUBIC)
    A = np.clip((A - 0.45) / 0.35, 0, 1); A = A * A * (3 - 2 * A)
    return np.dstack([rgb, (A * 255).astype(np.uint8)])
def lanczos_sharp(bgr, k=4):
    u = cv2.resize(bgr, (bgr.shape[1] * k, bgr.shape[0] * k), interpolation=cv2.INTER_LANCZOS4)
    bl = cv2.GaussianBlur(u, (0, 0), 2.0); return cv2.addWeighted(u, 1.6, bl, -0.6, 0)
LAYER = cv2.imread(str(SH / 'nomi-layer-sheet.png')); CHAR = cv2.imread(str(SH / 'nomi-character-sheet.png'))
# (name, sheet, (x, y, w, h))
tiles = []
for i, n in enumerate(['default', 'happy', 'squint', 'surprised', 'angry', 'sad', 'shy', 'confused', 'thinking', 'eyes-closed']):
    r, c = divmod(i, 5); tiles.append((f'layer-expr-{i + 1:02d}-{n}', 'L', (29 + 102 * c, 1231 + 113 * r, 86, 86)))
tiles += [('layer-eye-open', 'L', (564, 1242, 95, 74)), ('layer-eye-closed', 'L', (676, 1242, 94, 74)), ('layer-eye-pupil', 'L', (787, 1242, 95, 74)),
          ('layer-mouth-open', 'L', (564, 1354, 95, 70)), ('layer-mouth-smile', 'L', (676, 1354, 94, 70)), ('layer-mouth-pout', 'L', (787, 1354, 95, 70))]
for i, n in enumerate(['default', 'happy', 'squint', 'surprised', 'shy', 'angry', 'thinking', 'sad', 'closed']):
    r, c = divmod(i, 3); tiles.append((f'char-expr-{i + 1}-{n}', 'C', (1132 + 131 * c, 105 + 175 * r, 120, 138)))
tiles += [('char-detail-face', 'C', (845, 100, 160, 180)), ('char-detail-eye-small', 'C', (1013, 105, 87, 142)), ('char-detail-eye-big', 'C', (845, 313, 138, 152)),
          ('char-detail-hairclip', 'C', (988, 288, 112, 110)), ('char-detail-choker', 'C', (988, 430, 112, 132)), ('char-detail-jacket', 'C', (845, 497, 138, 218)),
          ('char-detail-belt-badge', 'C', (988, 593, 112, 156)), ('char-detail-thigh-strap', 'C', (845, 746, 138, 168)), ('char-detail-shoe', 'C', (988, 778, 112, 122)),
          ('char-other-hair-structure', 'C', (1135, 668, 125, 100)), ('char-other-ribbon', 'C', (1265, 668, 100, 100)), ('char-other-chibi', 'C', (1385, 660, 135, 120)),
          ('char-other-bag', 'C', (1145, 805, 115, 90)), ('char-other-badge', 'C', (1285, 795, 90, 110)), ('char-other-pendant', 'C', (1405, 795, 100, 105))]
views = [('layer-front-full', 'L', (0, 116, 345, 1049)), ('layer-front-hipup', 'L', (0, 116, 345, 609)), ('layer-side', 'L', (350, 95, 165, 565)),
         ('layer-back', 'L', (320, 670, 195, 505)), ('char-hero-front34', 'C', (20, 60, 440, 920)), ('char-side', 'C', (330, 80, 195, 880)), ('char-back', 'C', (540, 80, 215, 880))]
if __name__ == '__main__':
    info = {}
    t0 = time.time()
    for name, sh, (x, y, w, h) in tiles + views:
        src = (LAYER if sh == 'L' else CHAR)[y:y + h, x:x + w]
        up = esr_x4(src)
        is_view = (name, sh, (x, y, w, h)) in views
        if is_view: cv2.imwrite(str(CROPS / f'{name}@4x.jpg'), up, [cv2.IMWRITE_JPEG_QUALITY, 93])
        else: cv2.imwrite(str(CROPS / f'{name}@4x.png'), up)
        cv2.imwrite(str(CROPS / f'{name}@1x.png'), src)
        info[name] = dict(sheet='nomi-layer-sheet.png' if sh == 'L' else 'nomi-character-sheet.png', box=[x, y, w, h], native=[w, h], upscaled=[w * 4, h * 4], method='Real-ESRGAN x4plus anime 6B (ONNX, CPU)')
        print(name, w, h, f'{time.time() - t0:.0f}s', flush=True)
    # comparison: lanczos+unsharp vs ESRGAN on the front face crop
    face = LAYER[110:330, 40:240]
    cv2.imwrite(str(CROPS / 'compare-face-lanczos4x.png'), lanczos_sharp(face)); cv2.imwrite(str(CROPS / 'compare-face-esrgan4x.png'), esr_x4(face))
    # keyed parts -> x4 rgba
    PD = SH / 'parts'; PU = SH / 'parts-4x'; PU.mkdir(exist_ok=True)
    for p in sorted(PD.glob('*.png')):
        r = cv2.imread(str(p), cv2.IMREAD_UNCHANGED); cv2.imwrite(str(PU / p.name), up_rgba(r)); print('part', p.name, f'{time.time() - t0:.0f}s', flush=True)
    (CROPS / 'crops.json').write_text(json.dumps(info, indent=1, ensure_ascii=False))
