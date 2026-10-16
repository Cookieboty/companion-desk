#!/usr/bin/env python3
"""Headless CLI screenshots of the PoC at several frames (no browser, no GPU needed).

    python3 scripts/rive-eval/shots.py OUT_DIR [action ...]

For every action: fires its view-model trigger (rive --data=<action>=1) and captures N frames later,
then writes a contact sheet <action>-sheet.png.  Idle frames are captured without any trigger.
"""
import os, subprocess, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
PROJ = os.path.join(ROOT, 'rive/nomi-poc')
out = sys.argv[1]
acts = sys.argv[2:] or ['wave', 'hello', 'nod', 'think', 'pray', 'cheer', 'thumbs_up', 'celebrate']
os.makedirs(out, exist_ok=True)
env = dict(os.environ, PATH=os.path.expanduser('~/.rive/bin') + ':' + os.environ['PATH'])
FRAMES = [0, 20, 40, 60, 80, 110, 140, 170]


def shot(path, data=None, adv=1):
    cmd = ['rive', PROJ, f'--screenshot={path}', f'--advance={max(1, adv)}']
    if data:
        cmd.append(f'--data={data}=1')
    subprocess.run(cmd, env=env, check=True, capture_output=True)


def sheet(name, files, labels):
    ims = [Image.open(f).convert('RGBA') for f in files]
    tw, th = 240, 280
    cols = 4
    rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * tw, rows * (th + 14)), (40, 44, 52))
    d = ImageDraw.Draw(S)
    for i, (im, lb) in enumerate(zip(ims, labels)):
        t = im.resize((tw, th), Image.LANCZOS)
        S.paste(t.convert('RGB'), ((i % cols) * tw, (i // cols) * (th + 14)))
        d.text(((i % cols) * tw + 4, (i // cols) * (th + 14) + th + 1), lb, fill=(230, 230, 230))
    S.save(os.path.join(out, f'{name}-sheet.png'))
    print('sheet', os.path.join(out, f'{name}-sheet.png'))


if 'idle' in acts or not sys.argv[2:]:
    fs = []
    for fr in (1, 45, 90, 135, 180, 225, 270, 330):
        p = os.path.join(out, f'idle-f{fr:03d}.png'); shot(p, None, fr); fs.append(p)
    sheet('idle', fs, [f'idle f{x}' for x in (1, 45, 90, 135, 180, 225, 270, 330)])
for a in acts:
    if a == 'idle':
        continue
    fs = []
    for fr in FRAMES:
        p = os.path.join(out, f'{a}-f{fr:03d}.png'); shot(p, a, fr); fs.append(p)
    sheet(a, fs, [f'{a} f{x}' for x in FRAMES])
