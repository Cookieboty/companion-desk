#!/usr/bin/env python3
"""Side-by-side frame strips: canvas rig (top) vs Rive scene (bottom), same actions, same timestamps.

    python3 scripts/rive-eval/compare.py OUT_DIR [action ...]

Canvas frames come from the playwright harness (work/h2d, box-specific); Rive frames from the CLI
(`rive rive/nomi-layered --screenshot=... --advance=<frames> --data=<action>=1`, 60 fps).
Both are cropped identically (rig px 80..880 x 0..980) so poses can be compared directly.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
PROJ = os.path.join(ROOT, 'rive/nomi-layered')
HARNESS = os.environ.get('NOMI_HARNESS', '/workspace/work/h2d')
MODEL = '/nomi-2d-polish/packages/renderer/public/assets/models/sprite/nomi'
out = sys.argv[1]
acts = sys.argv[2:] or ['wave', 'shy_hair_touch', 'happy_bounce', 'ponder_lean']
os.makedirs(out, exist_ok=True)
env = dict(os.environ, PATH=os.path.expanduser('~/.rive/bin') + ':' + os.environ['PATH'])
CROP = (40, 0, 960, 980)
SC = 0.3
N = 6
DUR = {a['id']: a['dur'] for a in json.load(open(os.path.join(PROJ, 'actions.json')))}


def times(a):
    d = DUR[a] + 0.3
    return [round(d * (i + 0.5) / N, 3) for i in range(N)]


def canvas_frames(a, ts):
    e = json.dumps({'model': MODEL, 'actions': [a], 'times': ts, 'cols': N, 'frames': N, 'scale': SC, 'crop': list(CROP), 'tail': 0.3})
    d = os.path.join(out, 'canvas')
    subprocess.run(['node', 'shot.mjs', 'strip.js', d], cwd=HARNESS, env=dict(env, ENV=e), check=True, capture_output=True)
    return Image.open(os.path.join(d, a + '.png')).convert('RGB')


def rive_frames(a, ts):
    cw, ch = int((CROP[2] - CROP[0]) * SC), int((CROP[3] - CROP[1]) * SC)
    sheet = Image.new('RGB', (cw * N, ch), (246, 239, 232))
    for i, t in enumerate(ts):
        p = os.path.join(out, f'rive-{a}-{i}.png')
        subprocess.run(['rive', PROJ, f'--screenshot={p}', f'--advance={max(1, round(t * 60) + 2)}', f'--data={a}=1'],
                       env=env, check=True, capture_output=True)
        im = Image.open(p).convert('RGB').crop(CROP).resize((cw, ch), Image.LANCZOS)
        sheet.paste(im, (i * cw, 0))
    return sheet


for a in acts:
    ts = times(a)
    top = canvas_frames(a, ts)
    bot = rive_frames(a, ts)
    W = top.width
    S = Image.new('RGB', (W, top.height + bot.height + 16), (246, 239, 232))
    S.paste(top, (0, 0))
    S.paste(bot, (0, top.height + 16))
    d = ImageDraw.Draw(S)
    d.text((4, top.height + 2), f'RIVE (bones + meshes, same layer PNGs) - {a}   t = ' + '  '.join(f'{t:.2f}' for t in ts), fill=(20, 20, 20))
    d.text((W - 220, 2), 'CANVAS rig (top)', fill=(20, 20, 20))
    S.save(os.path.join(out, f'{a}-compare.png'))
    print('wrote', os.path.join(out, f'{a}-compare.png'))
