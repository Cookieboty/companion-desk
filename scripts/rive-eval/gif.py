#!/usr/bin/env python3
"""Animated side-by-side GIFs (canvas rig | Rive) for a few actions, 12 fps.

    python3 scripts/rive-eval/gif.py OUT_DIR [action ...]
"""
import json, os, subprocess, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
PROJ = os.path.join(ROOT, 'rive/nomi-layered')
HARNESS = os.environ.get('NOMI_HARNESS', '/workspace/work/h2d')
MODEL = '/nomi-2d-polish/packages/renderer/public/assets/models/sprite/nomi'
out = sys.argv[1]
acts = sys.argv[2:] or ['wave', 'shy_hair_touch', 'happy_bounce', 'ponder_lean']
os.makedirs(out, exist_ok=True)
env = dict(os.environ, PATH=os.path.expanduser('~/.rive/bin') + ':' + os.environ['PATH'])
CROP = (40, 0, 960, 980)
SC = 0.5
FPS = 12
DUR = {a['id']: a['dur'] for a in json.load(open(os.path.join(PROJ, 'actions.json')))}
cw, ch = int((CROP[2] - CROP[0]) * SC), int((CROP[3] - CROP[1]) * SC)
for a in acts:
    n = int((DUR[a] + 0.3) * FPS)
    ts = [round(i / FPS, 4) for i in range(n)]
    e = json.dumps({'model': MODEL, 'actions': [a], 'times': ts, 'cols': n, 'frames': n, 'scale': SC, 'crop': list(CROP), 'tail': 0.3})
    d = os.path.join(out, 'canvas')
    subprocess.run(['node', 'shot.mjs', 'strip.js', d], cwd=HARNESS, env=dict(env, ENV=e), check=True, capture_output=True)
    sheet = Image.open(os.path.join(d, a + '.png')).convert('RGB')
    frames = []
    for i, t in enumerate(ts):
        c = sheet.crop((i * cw, 14, (i + 1) * cw, 14 + ch))
        p = os.path.join(out, f'_r.png')
        subprocess.run(['rive', PROJ, f'--screenshot={p}', f'--advance={round(t * 60) + 2}', f'--data={a}=1'], env=env, check=True, capture_output=True)
        r = Image.open(p).convert('RGB').crop(CROP).resize((cw, ch), Image.LANCZOS)
        f = Image.new('RGB', (cw * 2 + 6, ch), (80, 80, 80))
        f.paste(c, (0, 0))
        f.paste(r, (cw + 6, 0))
        frames.append(f.quantize(colors=128, method=Image.Quantize.MEDIANCUT))
    path = os.path.join(out, f'{a}-canvas-vs-rive.gif')
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0, optimize=True)
    print('wrote', path, len(frames), 'frames (left canvas rig, right Rive)')
