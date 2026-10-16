"""Local neural inpainting (LaMa, big-lama ONNX, Apache-2.0) used to fill hidden cloth areas.
Model is NOT in the repo: scratch download  https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"""
import numpy as np, cv2, onnxruntime as ort, os
MODEL = os.environ.get('LAMA_ONNX', '/workspace/scratch/models/lama_fp32.onnx')
_s = None
def sess():
    global _s
    if _s is None:
        _s = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
    return _s

def fill_window(rgb, mask, box):
    """rgb HxWx3 uint8 (BGR ok, channel-agnostic), mask HxW {0,1}; box=(x0,y0,x1,y1) square-ish window. returns filled rgb (only mask changed)."""
    x0, y0, x1, y1 = box
    c = rgb[y0:y1, x0:x1]; m = mask[y0:y1, x0:x1]
    h, w = m.shape
    ci = cv2.resize(c, (512, 512), interpolation=cv2.INTER_AREA if max(h, w) > 512 else cv2.INTER_CUBIC)
    cm = cv2.resize(m.astype(np.uint8) * 255, (512, 512), interpolation=cv2.INTER_NEAREST)
    cm = (cm > 127).astype(np.float32)
    inp = (ci[..., ::-1].astype(np.float32) / 255).transpose(2, 0, 1)[None]
    out = sess().run(None, {'image': inp, 'mask': cm[None, None]})[0][0]
    out = np.clip(out.transpose(1, 2, 0), 0, 1)
    if out.max() <= 1.0 and out.mean() < 0.01: raise RuntimeError('lama output looks empty')
    o = (out[..., ::-1] * 255).astype(np.uint8)
    o = cv2.resize(o, (w, h), interpolation=cv2.INTER_CUBIC)
    res = rgb.copy()
    sel = m.astype(bool)
    res[y0:y1, x0:x1][sel] = o[sel]
    return res
