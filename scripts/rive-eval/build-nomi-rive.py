#!/usr/bin/env python3
"""Generate rive/nomi-poc/scene.rml (+ rive.yaml) from the EXISTING brand-locked Nomi layer PNGs.

Brand lock: this script never draws, traces or edits character art. Every brand-critical part
(face plate, bangs, eyes, hair clip, ribbon, jacket/body, badge, strap, hands, sleeves) is an
<ImageAsset> that points at the pixel-exact master PNG in
packages/renderer/public/assets/models/sprite/nomi/layers/.  Rive only moves / skins them.
The only vector art added is non-brand FX (sparkle stars) and clip masks.

    python3 scripts/rive-eval/build-nomi-rive.py   # writes rive/nomi-poc/{rive.yaml,scene.rml}
    rive rive/nomi-poc --once                      # -> rive/nomi-poc/build/nomi-poc.riv
"""
from __future__ import annotations

import base64
import json
import math
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from rml import El  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'packages/renderer/public/assets/models/sprite/nomi'
PROJ = ROOT / 'rive/nomi-poc'
RIG = json.loads((MODEL / 'manifest.json').read_text())['rig']
LAYERS = RIG['layers']
A = RIG['anchors']
P = RIG['pivots']
W, H = RIG['size']  # 960 x 1120 rig space
FIG = (W / 2, H)  # figure pivot = bottom centre (same as layeredRig.ts)

REL = Path('../../packages/renderer/public/assets/models/sprite/nomi')  # relative to PROJ

# --------------------------------------------------------------------------------------
# assets
# --------------------------------------------------------------------------------------
asset_els: dict[str, El] = {}
asset_size: dict[str, tuple[int, int]] = {}


def asset(key: str, rel: str) -> El:
    if key not in asset_els:
        png = MODEL / rel
        asset_size[key] = Image.open(png).size
        asset_els[key] = El('ImageAsset', key, ident=True, file=str(REL / rel))
    return asset_els[key]


def layer_asset(name: str) -> El:
    return asset(name, f'layers/{name}.png')


def hand_asset(name: str) -> El:
    return asset(f'hand-{name}', f'layers/hands/hand-{name}.png')


def rel(a, b):
    return (a[0] - b[0], a[1] - b[1])


# --------------------------------------------------------------------------------------
# element helpers (positions are ABSOLUTE rig px; parent abs is subtracted)
# --------------------------------------------------------------------------------------
def node(name, pos, parent, **kw) -> El:
    r = rel(pos, parent)
    return El('Node', name, ident=True, x=r[0], y=r[1], **kw)


def image(name, parent_abs, key=None, off=None, scale=None, **kw) -> El:
    """Image of layer `name` at its manifest offset (rig px); parent_abs = abs pos of parent."""
    a = layer_asset(name) if key is None else key
    o = LAYERS[name]
    k = scale if scale is not None else (o[2] if len(o) > 2 else 1)
    pos = off or (o[0], o[1])
    r = rel(pos, parent_abs)
    el = El('Image', name, ident=True, assetId=a.need_id(), x=r[0], y=r[1], originX=0, originY=0, **kw)
    if k != 1:
        el.attrs['scaleX'] = k
        el.attrs['scaleY'] = k
    return el


def back_to_front(parent: El, *kids: El) -> El:
    """Rive paints the FIRST child on top. Callers list back -> front; we reverse."""
    parent.add(*reversed(kids))
    return parent


# --------------------------------------------------------------------------------------
# skinned arm mesh (3 bones: static stump / shoulder / elbow)
# --------------------------------------------------------------------------------------
ELBOW_S, BEND_LEN, HAND_S = 335.0, 120.0, 470.0
STUMP_S0, STUMP_S1 = 60.0, 150.0  # weights: rigid with the torso above S0, fully shoulder below S1
TAPER_TO = 100.0  # sleeve width (rig px) the short forearm tapers to, under the hand piece


def smooth01(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def varuint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


class Arm:
    """Geometry + bone chain for one arm (side 'l' or 'r')."""

    def __init__(self, side: str):
        self.side = side
        g = RIG['arms'][side]
        self.g = g
        self.sgn = g['sgn']
        th = g['theta']
        self.u = (self.sgn * math.sin(th), math.cos(th))
        self.w = (math.cos(th), -self.sgn * math.sin(th))
        self.layer = g['layer']
        self.off = LAYERS[self.layer][:2]
        self.pivot = P[self.layer]  # absolute shoulder pivot
        s0 = g['s0']
        self.s0_abs = (self.off[0] + s0[0], self.off[1] + s0[1])
        self.elbow = self.spine(ELBOW_S)
        d1 = rel(self.elbow, self.pivot)
        self.L1 = math.hypot(*d1)
        self.a1 = math.atan2(d1[1], d1[0])  # shoulder bone world angle at rest
        self.a2 = math.atan2(self.u[1], self.u[0])  # forearm world angle at rest (spine dir)
        self.rest2 = self.a2 - self.a1  # elbow bone rest rotation relative to the shoulder bone
        self.L2 = HAND_S - ELBOW_S
        self.img = Image.open(MODEL / f'layers/{self.layer}.png')
        self.stump_bone = self.shoulder_bone = self.elbow_bone = None
        self.hand_names: set[str] = set()

    def spine(self, s, n=0.0):
        return (
            self.s0_abs[0] + s * self.u[0] + n * self.w[0],
            self.s0_abs[1] + s * self.u[1] + n * self.w[1],
        )

    def fk(self, d1, d2, d_scale=1.0):
        """wrist position + forearm world angle for bone rotation deltas (rad)."""
        a_sh = self.a1 + d1
        ex = self.pivot[0] + self.L1 * math.cos(a_sh)
        ey = self.pivot[1] + self.L1 * math.sin(a_sh)
        a_fa = a_sh + self.rest2 + d2
        return (ex + self.L2 * d_scale * math.cos(a_fa), ey + self.L2 * d_scale * math.sin(a_fa)), a_fa

    def weights(self, s):
        wst = 1 - smooth01((s - STUMP_S0) / (STUMP_S1 - STUMP_S0))
        w2 = smooth01((s - (ELBOW_S - BEND_LEN / 2)) / BEND_LEN)
        parts = [wst, (1 - wst) * (1 - w2), (1 - wst) * w2]
        vals = [int(round(255 * p)) for p in parts]
        vals[1] += 255 - sum(vals)  # totals must be exactly 255
        packed_v = sum(v << (8 * i) for i, v in enumerate(vals))
        packed_i = sum((i + 1) << (8 * i) for i in range(3))
        return packed_v, packed_i

    def mesh_image(self, name, parent_abs, short=False, cols=7) -> El:
        g = self.g
        iw, ih = self.img.size
        smax = HAND_S + 6 if short else g['smax']
        b0, b1 = ELBOW_S - BEND_LEN / 2, ELBOW_S + BEND_LEN / 2
        ss = [g['smin'], 40, 90, 120, 150, 180, 230]
        t = b0
        while t <= b1 + 0.1:
            ss.append(t)
            t += BEND_LEN / 8
        t = b1 + 30
        while t < smax - 6:
            ss.append(t)
            t += 24 if short else 30
        ss.append(smax)
        ss = sorted(set(round(s, 3) for s in ss if g['smin'] <= s <= smax))
        n0, n1 = g['nmin'] - 8, g['nmax'] + 8
        ns = [n0 + (n1 - n0) * i / (cols - 1) for i in range(cols)]
        nmid = (g['nmin'] + g['nmax']) / 2
        full_w = g['nmax'] - g['nmin']

        def taper(s):
            if not short:
                return 1.0
            f = smooth01((s - 300) / (HAND_S - 30 - 300))
            return 1 + (TAPER_TO / full_w - 1) * f

        verts = []
        for s in ss:
            for n in ns:
                sx = g['s0'][0] + s * self.u[0] + n * self.w[0]
                sy = g['s0'][1] + s * self.u[1] + n * self.w[1]
                nn = nmid + (n - nmid) * taper(s)
                dx = g['s0'][0] + s * self.u[0] + nn * self.w[0]
                dy = g['s0'][1] + s * self.u[1] + nn * self.w[1]
                verts.append((dx, dy, clamp(sx / iw, 0, 1), clamp(sy / ih, 0, 1), s))
        R, C = len(ss), len(ns)
        idx = lambda r, c: r * C + c  # noqa: E731
        bset = {idx(r, c) for r in range(R) for c in range(C) if r in (0, R - 1) or c in (0, C - 1)}
        order = sorted(bset) + [i for i in range(len(verts)) if i not in bset]
        newi = {old: new for new, old in enumerate(order)}
        tri = bytearray()
        for r in range(R - 1):
            for c in range(C - 1):
                a, b, c2, d = idx(r, c), idx(r, c + 1), idx(r + 1, c + 1), idx(r + 1, c)
                for t3 in ((a, b, c2), (a, c2, d)):
                    for v in t3:
                        tri += varuint(newi[v])
        el = El('Image', name, ident=True, assetId=layer_asset(self.layer).need_id(),
                x=self.off[0] - parent_abs[0], y=self.off[1] - parent_abs[1], originX=0, originY=0)
        mesh = El('Mesh', 'Mesh', triangleIndexBytes=base64.b64encode(bytes(tri)).decode())
        for i in order:
            x, y, u_, v_, s = verts[i]
            vals, inds = self.weights(s)
            vtx = El('ContourMeshVertex' if i in bset else 'MeshVertex', x=x, y=y, u=u_, v=v_)
            vtx.add(El('Weight', values=vals, indices=inds))
            mesh.add(vtx)
        el.add(mesh)
        self.vertex_count = getattr(self, 'vertex_count', 0) + len(verts)
        self._mesh_host = el
        mesh.add(self.skin())
        return el

    def skin(self):
        """Skin + tendons. Bind pose = rest pose in artboard space (all idle/act wrappers at identity)."""
        sk = El('Skin', 'Skin', xx=1, xy=0, yx=0, yy=1, tx=self.off[0], ty=self.off[1])
        c1, s1 = math.cos(self.a1), math.sin(self.a1)
        c2, s2 = math.cos(self.a2), math.sin(self.a2)
        sk.add(El('Tendon', 'stump', boneId=self.stump_bone.need_id(),
                  xx=c1, xy=s1, yx=-s1, yy=c1, tx=self.pivot[0], ty=self.pivot[1]))
        sk.add(El('Tendon', 'shoulder', boneId=self.shoulder_bone.need_id(),
                  xx=c1, xy=s1, yx=-s1, yy=c1, tx=self.pivot[0], ty=self.pivot[1]))
        sk.add(El('Tendon', 'elbow', boneId=self.elbow_bone.need_id(),
                  xx=c2, xy=s2, yx=-s2, yy=c2, tx=self.elbow[0], ty=self.elbow[1]))
        return sk

    def make_bones(self, parent_abs) -> El:
        n = node(f'arm-{self.side}.rig', self.pivot, parent_abs)
        self.stump_bone = El('RootBone', f'arm-{self.side}.stump', ident=True, x=0, y=0, rotation=self.a1, length=40)
        self.shoulder_bone = El('RootBone', f'arm-{self.side}.shoulder', ident=True, x=0, y=0, rotation=self.a1, length=self.L1)
        self.elbow_bone = El('Bone', f'arm-{self.side}.elbow', ident=True, rotation=self.rest2, length=self.L2)
        self.shoulder_bone.add(self.elbow_bone)
        n.add(self.stump_bone, self.shoulder_bone)
        self.rig_node = n
        return n


HAND_CODES = ['', 'wave', 'fist', 'thumbsup', 'point', 'rest', 'peace', 'prayer', 'ok', 'chest']


def hand_scale(name: str, cuff_w: float) -> float:
    m = RIG['hands'][name]
    sw = max(40, m.get('sleeveW') or 160)
    return max(0.28, min(0.48, (cuff_w * 0.5) / sw)) * m.get('k', 1)


# --------------------------------------------------------------------------------------
# animation machinery
# --------------------------------------------------------------------------------------
CURVES = {  # CSS-style cubic-bezier handles per ease code
    'io': (0.42, 0, 0.58, 1),
    'o': (0, 0, 0.58, 1),
    'i': (0.42, 0, 1, 1),
    'b': (0.34, 1.45, 0.64, 1),  # back-out
}


def rad(d):
    return d * math.pi / 180.0


class Anim:
    def __init__(self, name: str, frames: int, loop: bool):
        self.el = El('LinearAnimation', name, ident=True, loopValue='loop' if loop else 'oneShot',
                     duration=int(frames), fps=60)
        self.items: dict[str, tuple[El, dict[str, list]]] = {}
        self.name = name
        self.frames = int(frames)

    def key(self, target: El, prop: str, keys: list, kind='double'):
        """keys: [(frame, value, ease)]; ease = the curve used for the segment LEAVING this key."""
        _, props = self.items.setdefault(target.need_id(), (target, {}))
        props[prop] = (kind, sorted(keys, key=lambda k: k[0]))

    def finish(self) -> El:
        for el, props in self.items.values():
            ko = El('KeyedObject', objectId=el.id)
            for prop, (kind, keys) in props.items():
                kp = El('KeyedProperty', property=prop) if prop != 'activeComponentId' else El('KeyedProperty', propertyKey=296)
                for f, v, e in keys:
                    if kind == 'id':
                        kp.add(El('KeyFrameId', value=v, frame=int(f), interpolationType='hold'))
                    else:
                        kf = El('KeyFrameDouble', value=v, frame=int(f))
                        if e == 's':
                            kf.attrs['interpolationType'] = 'hold'
                        elif e == 'l':
                            kf.attrs['interpolationType'] = 'linear'
                        else:
                            kf.attrs['interpolationType'] = 'cubic'
                            x1, y1, x2, y2 = CURVES[e]
                            kf.add(El('CubicEaseInterpolator', x1=x1, y1=y1, x2=x2, y2=y2))
                        kp.add(kf)
                ko.add(kp)
            self.el.add(ko)
        return self.el


def f(sec: float) -> int:
    return int(round(sec * 60))


def swing_keys(frames: int, cycles: int, amp: float, phase=0.0, base=0.0, ease='io', n_per=4):
    """loopable sine-ish keys (cubic ease) -- n_per keys per cycle"""
    keys = []
    n = cycles * n_per
    for i in range(n + 1):
        t = i / n
        keys.append((round(frames * t), base + amp * math.sin(2 * math.pi * cycles * t + phase), ease))
    keys[-1] = (frames, keys[0][1], ease)
    return keys


# --------------------------------------------------------------------------------------
# scene
# --------------------------------------------------------------------------------------
class Scene:
    def __init__(self, action_defs: list[dict]):
        self.actions = action_defs
        self.rest: dict[tuple[str, str], tuple[El, str, float]] = {}
        self.ab = El('Artboard', 'Nomi', ident=False, width=W, height=H, styleId='0:5')
        self.ab.attrs['id'] = '0:2'
        self.ab.id = '0:2'
        self.ab.add(El('LayoutComponentStyle', 'Artboard Style', id='0:5'))
        self.neck = tuple(A['neck'])
        self.build()

    def rest_of(self, el: El, prop: str) -> float:
        if prop in el.attrs:
            return float(el.attrs[prop])
        return {'scaleX': 1, 'scaleY': 1, 'opacity': 1}.get(prop, 0.0)

    def build(self):
        ab = self.ab
        neck = self.neck
        self.figIdle = node('fig.idle', FIG, (0, 0))
        self.figAct = node('fig.act', FIG, FIG)
        self.figIdle.add(self.figAct)

        self.armL, self.armR = Arm('l'), Arm('r')
        self.arms = {'l': self.armL, 'r': self.armR}
        # hands needed by the chosen actions
        for a in self.actions:
            for tr in a['tracks']:
                if tr['p'] in ('rHand', 'lHand'):
                    side = tr['p'][0]
                    for _, v, *_ in tr['k']:
                        if int(v) and HAND_CODES[int(v)] != 'prayer':
                            self.arms[side].hand_names.add(HAND_CODES[int(v)])

        # --- body: rest plate (arms baked in) vs posed group (body-noarm + skinned arms)
        self.restBody = image('body', FIG)
        self.posed = node('posed', FIG, FIG)  # opacity switched by the actions
        self.posed.attrs['opacity'] = 0
        body_noarm = image('body-noarm', FIG)

        self.arm_parts = {}
        for side, arm in self.arms.items():
            bones = arm.make_bones(FIG)
            full = arm.mesh_image(f'arm-{side}.full', FIG)
            short = arm.mesh_image(f'arm-{side}.short', FIG, short=True)
            short.attrs['opacity'] = 0
            wrist = El('Node', f'arm-{side}.wrist', ident=True, x=arm.L2, y=0, rotation=math.pi / 2)
            arm.elbow_bone.add(wrist)
            arm.wrist = wrist
            arm.hand_nodes = {}
            for hn in sorted(arm.hand_names):
                meta = RIG['hands'][hn]
                hs = hand_scale(hn, arm.g['nmax'] - arm.g['nmin'])
                cuff_lift = max(0, (meta['ay'] - (meta.get('cuffY') or meta['ay'] * 0.6)) * 0.2)
                hnode = El('Node', f'hand-{side}.{hn}', ident=True, x=0, y=cuff_lift * hs,
                           scaleX=arm.sgn * hs, scaleY=hs, opacity=0)
                im = El('Image', f'hand-{hn}', assetId=hand_asset(hn).need_id(), x=0, y=0,
                        originX=meta['ax'] / meta['w'], originY=meta['ay'] / meta['h'])
                hnode.add(im)
                wrist.add(hnode)
                arm.hand_nodes[hn] = hnode
            self.arm_parts[side] = (full, short, bones)

        # joint prayer piece (both hands), placed at the mid-point of the two wrists at the final pose
        self.prayer = None
        if any(HAND_CODES[int(v)] == 'prayer' for a in self.actions for tr in a['tracks']
               if tr['p'] in ('rHand', 'lHand') for _, v, *_ in tr['k'] if int(v)):
            self.prayer = self.make_prayer()

        # badge / strap
        badge_n = node('badge.idle', P['badge'], FIG)
        badge_n.add(image('badge', P['badge']))
        strap_n = node('strap-r.idle', P['strap-r'], FIG)
        strap_n.add(image('strap-r', P['strap-r']))
        self.badge, self.strap = badge_n, strap_n

        # head
        self.headIdle = node('head.idle', neck, FIG)
        self.headAct = node('head.act', neck, neck)
        self.headIdle.add(self.headAct)
        self.feat = node('features', neck, neck)
        eyes = []
        self.eye = {}
        for side in ('l', 'r'):
            m = RIG['eyes'][side]
            cx = (m['x0'] + m['x1']) / 2
            ep = (cx, m['top'])
            blink = node(f'eye-{side}.blink', ep, neck)
            act = node(f'eye-{side}.act', ep, ep)
            blink.add(act)
            look = node(f'iris-{side}.look', ep, ep)
            iris_act = node(f'iris-{side}.act', ep, ep)
            look.add(iris_act)
            iris_act.add(image(f'iris-{side}', ep))
            back_to_front(act, image(f'eye-white-{side}', ep), look, image(f'lash-{side}', ep))
            eyes.append(blink)
            self.eye[side] = dict(blink=blink, act=act, look=look, iris=iris_act)
        self.solo = El('Solo', 'mouth.solo', ident=True, x=0, y=0)
        self.mouths = {nm: image(nm, neck) for nm in ('mouth', 'mouth-open', 'mouth-o', 'mouth-frown')}
        back_to_front(self.solo, *self.mouths.values())
        self.solo.attrs['activeComponentId'] = self.mouths['mouth'].id
        back_to_front(self.feat, *eyes, self.solo)

        self.hairL = node('hair-l.idle', A['hairL'], neck)
        self.hairL.add(image('hair-side-l', A['hairL']))
        self.hairR = node('hair-r.idle', A['hairR'], neck)
        self.hairR.add(image('hair-side-r', A['hairR']))
        self.ribbon = node('ribbon.idle', A['ribbon'], neck)
        self.ribbon.add(image('ribbon', A['ribbon']))
        back_to_front(
            self.headAct,
            image('head', neck), image('crown', neck), self.feat, image('bangs', neck),
            image('clip', neck), self.hairL, self.hairR, self.ribbon, image('earring', neck),
        )

        # FX: sparkle stars (vector, NOT brand art)
        self.fx = node('fx.sparkle', (480, 160), FIG)
        self.stars = []
        for i, (sx, sy, sz) in enumerate(((300, 130, 46), (640, 110, 56), (480, 40, 38))):
            st = node(f'star{i}', (sx, sy), (480, 160))
            st.attrs['opacity'] = 0
            sh = El('Shape', f'star{i}.shape', ident=True)
            sh.add(El('Star', 'path', points=4, innerRadius=0.28, width=sz, height=sz))
            fill = El('Fill', 'fill')
            fill.add(El('SolidColor', 'c', colorValue='FFFFC857'))
            sh.add(fill)
            st.add(sh)
            self.fx.add(st)
            self.stars.append(st)

        full_l, short_l, bones_l = self.arm_parts['l']
        full_r, short_r, bones_r = self.arm_parts['r']
        # arms are drawn IN FRONT of the head (chin / cheek poses); back -> front below
        back_to_front(self.posed, body_noarm, full_l, short_l, full_r, short_r)
        figure_kids = [self.restBody, self.posed, self.badge, self.strap, self.headIdle,
                       bones_l, bones_r]
        if self.prayer is not None:
            figure_kids.append(self.prayer)
        figure_kids.append(self.fx)
        back_to_front(self.figAct, *figure_kids)
        ab.add(self.figIdle)

    def make_prayer(self) -> El:
        meta = RIG['hands']['prayer']
        # joint at the mean of both wrists in the 'pray' pose
        pose = None
        for a in self.actions:
            if a['id'] == 'pray':
                pose = a
        d = {}
        for tr in pose['tracks']:
            if tr['p'] in ('rA', 'rE', 'rW', 'lA', 'lE', 'lW'):
                d[tr['p']] = tr['k'][-1][1]
        pts, angs = [], []
        for side in ('r', 'l'):
            arm = self.arms[side]
            sg = arm.sgn
            (wx, wy), fa = arm.fk(-sg * rad(d[side + 'A']), -sg * rad(d[side + 'E']))
            pts.append((wx, wy))
            angs.append(fa + math.pi / 2 - sg * rad(d[side + 'W']))
        cx = sum(p[0] for p in pts) / 2
        cy = sum(p[1] for p in pts) / 2
        ang = sum(math.atan2(math.sin(a), math.cos(a)) for a in angs) / 2
        hs = hand_scale('prayer', self.armL.g['nmax'] - self.armL.g['nmin'])
        n = node('prayer.joint', (cx, cy), FIG, rotation=ang, scaleX=hs, scaleY=hs, opacity=0)
        im = El('Image', 'hand-prayer', assetId=hand_asset('prayer').need_id(), x=0, y=0,
                originX=meta['ax'] / meta['w'], originY=meta['ay'] / meta['h'])
        # keep only 40 art px of sleeve below the cuff (same crop the canvas rig uses for the joint)
        yb = min(meta['ay'], (meta.get('cuffY') or meta['ay'] * 0.6) + 40)
        clip = El('Shape', 'prayer.clip', ident=True, x=-meta['ax'], y=-meta['ay'])
        clip.add(El('Rectangle', 'p', originX=0, originY=0, width=meta['w'], height=yb))
        im.add(El('ClippingShape', 'cut', sourceId=clip.need_id()))
        n.add(im, clip)
        self.prayer_info = dict(pos=(cx, cy), angle=ang, scale=hs)
        return n


# --------------------------------------------------------------------------------------
# transcoding the existing keyframe actions (actions.ts) into Rive LinearAnimations
# --------------------------------------------------------------------------------------
def _ease(code: str, x: float) -> float:
    if code == 'l':
        return x
    if code == 'i':
        return x * x
    if code == 'o':
        return 1 - (1 - x) * (1 - x)
    if code == 'io':
        return x * x * (3 - 2 * x)
    if code == 'b':
        c1 = 1.12
        c3 = c1 + 1
        y = x - 1
        return 1 + c3 * y ** 3 + c1 * y * y
    return 0.0


def sample_track(tr: dict, t: float) -> float:
    ks = sorted(tr['k'], key=lambda k: k[0])
    if t <= ks[0][0]:
        v = ks[0][1]
    elif t >= ks[-1][0]:
        v = ks[-1][1]
    else:
        v = ks[-1][1]
        for i in range(len(ks) - 1):
            if ks[i][0] <= t < ks[i + 1][0]:
                t0, t1 = ks[i][0], ks[i + 1][0]
                code = ks[i + 1][2] if len(ks[i + 1]) > 2 else 'io'
                if code == 's':
                    v = ks[i][1]
                else:
                    u = (t - t0) / (t1 - t0) if t1 > t0 else 1
                    v = ks[i][1] + (ks[i + 1][1] - ks[i][1]) * _ease(code, u)
                break
    o = tr.get('osc')
    if o:
        lo, hi = tr.get('oscWin') or (0, 1e9)
        if lo <= t <= hi:
            v += o[0] * math.sin(o[1] * 2 * math.pi * t + (o[2] if len(o) > 2 else 0))
    return v


DISCRETE = {'rHand', 'lHand', 'eyeL', 'eyeR', 'mouth', 'brow', 'armFront', 'rOn', 'lOn'}
EYE_SCALE = {0: 1.0, 1: 0.55, 2: 0.08, 3: 0.32, 4: 1.08, 5: 0.8, 6: 0.85, 7: 0.3}
MOUTH_PICK = {0: 'mouth', 1: 'mouth', 2: 'mouth', 3: 'mouth-open', 4: 'mouth-o', 5: 'mouth-frown',
              6: 'mouth', 7: 'mouth', 8: 'mouth-open', 9: 'mouth-open', 10: 'mouth-o', 11: 'mouth-frown'}


def simplify(keys, eps):
    """Douglas-Peucker on [(frame, value)] -> kept subset (linear interpolation between kept keys)."""
    if len(keys) < 3:
        return keys

    def rec(lo, hi, out):
        (f0, v0), (f1, v1) = keys[lo], keys[hi]
        worst, wi = -1.0, None
        for i in range(lo + 1, hi):
            fi, vi = keys[i]
            vl = v0 + (v1 - v0) * ((fi - f0) / (f1 - f0) if f1 != f0 else 0)
            d = abs(vi - vl)
            if d > worst:
                worst, wi = d, i
        if worst > eps and wi is not None:
            rec(lo, wi, out)
            out.add(wi)
            rec(wi, hi, out)

    keep = {0, len(keys) - 1}
    rec(0, len(keys) - 1, keep)
    return [keys[i] for i in sorted(keep)]


# The canvas rig hides its poses behind distal foreshortening + on-canvas keeping; with real bones the
# same degrees read very differently, so a few actions get per-param gains (Rive-native pose tuning).
GAINS: dict[str, dict[str, float]] = {
    'wave': {'rA': 1.5, 'rE': 1.75, 'rW': 1.0},
    'hello': {'rA': 1.5, 'rE': 1.75},
    'think': {'rA': 4.5, 'rE': 1.8, 'rW': 0.4},
    'cheer': {'rA': 1.5, 'rE': 1.7},
    'thumbs_up': {'rA': 1.5, 'rE': 1.5},
    'celebrate': {'rA': 1.5, 'rE': 1.7, 'lA': 1.5, 'lE': 1.7},
}


def build_action_anim(sc: Scene, a: dict, tail: float = 0.4) -> tuple[Anim, set]:
    dur = a['dur']
    total = f(dur + tail)
    anim = Anim(a['id'], total, False)
    trk = {t['p']: t for t in a['tracks']}
    dense = {p for p, t in trk.items() if t.get('osc')}
    unsupported = sorted(set(trk) - SUPPORTED)

    gains = GAINS.get(a['id'], {})

    def val(p: str, fr: int) -> float:
        if p not in trk:
            return 0.0
        t = fr / 60.0
        if t <= dur:
            return sample_track(trk[p], t) * gains.get(p, 1.0)
        v_end = sample_track(trk[p], dur) * gains.get(p, 1.0)
        if p in DISCRETE:
            return 0.0
        u = clamp((t - dur) / tail, 0, 1)
        return v_end * (1 - _ease('io', u))

    grid = list(range(0, total + 1, 2))
    if grid[-1] != total:
        grid.append(total)
    # extra resolution inside oscillation windows (wrist waves at ~3 Hz)
    for p in dense:
        lo, hi = trk[p].get('oscWin') or (0, dur)
        for fr in range(f(lo), min(total, f(hi)) + 1):
            if fr not in grid:
                grid.append(fr)
    grid = sorted(set(grid))

    contrib: dict[tuple[str, str], tuple[El, list]] = {}

    def add(el: El, prop: str, fn, kind='cont', eps=0.002):
        series = [(fr, fn(fr)) for fr in grid]
        contrib[(el.id or el.need_id(), prop)] = (el, prop, series, kind, eps)

    ca = sc.figAct
    ha = sc.headAct
    add(ca, 'y', lambda fr: sc.rest_of(ca, 'y') + val('bodyY', fr), eps=0.15)
    if 'torsoRot' in trk:
        add(ca, 'rotation', lambda fr: rad(val('torsoRot', fr)))
    if 'torsoX' in trk:
        add(ca, 'x', lambda fr: sc.rest_of(ca, 'x') + val('torsoX', fr), eps=0.15)
    if 'scale' in trk:
        add(ca, 'scaleX', lambda fr: 1 + val('scale', fr))
        add(ca, 'scaleY', lambda fr: 1 + val('scale', fr))
    add(ha, 'rotation', lambda fr: rad(val('headRot', fr)) + rad(0.18 * val('headNod', fr)), eps=0.0015)
    add(ha, 'y', lambda fr: sc.rest_of(ha, 'y') + 0.45 * val('headNod', fr), eps=0.12)
    add(ha, 'x', lambda fr: sc.rest_of(ha, 'x') + val('headX', fr), eps=0.12)
    add(sc.feat, 'y', lambda fr: sc.rest_of(sc.feat, 'y') + 0.28 * val('headNod', fr), eps=0.12)
    for side in ('l', 'r'):
        ir = sc.eye[side]['iris']
        add(ir, 'x', lambda fr: 3.5 * val('gazeX', fr), eps=0.1)
        add(ir, 'y', lambda fr: -3.0 * val('gazeY', fr), eps=0.1)
        ea = sc.eye[side]['act']
        code = 'eyeL' if side == 'l' else 'eyeR'
        add(ea, 'scaleY', lambda fr, code=code: EYE_SCALE.get(int(round(val(code, fr))), 1.0), kind='smooth', eps=0.01)
    # arms
    for side in ('l', 'r'):
        arm = sc.arms[side]
        sg = arm.sgn
        A_, E_, W_ = side + 'A', side + 'E', side + 'W'
        if not any(k in trk for k in (A_, E_, W_, side + 'Hand', side + 'On')):
            continue
        add(arm.shoulder_bone, 'rotation', lambda fr, arm=arm, sg=sg, A_=A_: arm.a1 - sg * rad(val(A_, fr)), eps=0.0015)
        add(arm.elbow_bone, 'rotation', lambda fr, arm=arm, sg=sg, E_=E_: arm.rest2 - sg * rad(val(E_, fr)), eps=0.0015)
        add(arm.wrist, 'rotation', lambda fr, sg=sg, W_=W_: math.pi / 2 - sg * rad(val(W_, fr)), eps=0.002)

        def fore(fr, A_=A_, E_=E_):
            raise_ = max(min(1.0, abs(rad(val(A_, fr))) / 0.55), min(1.0, abs(rad(val(E_, fr))) / 1.4) * 0.55)
            return 1 - 0.3 * raise_

        add(arm.elbow_bone, 'scaleX', fore, eps=0.004)
        hand = side + 'Hand'
        for hn, hnode in arm.hand_nodes.items():
            add(hnode, 'opacity', lambda fr, hand=hand, hn=hn: 1.0 if HAND_CODES[int(round(val(hand, fr)))] == hn else 0.0, kind='hold')
        short = [e for e in sc.posed.children if e.attrs.get('name') == f'arm-{side}.short'][0]
        full = [e for e in sc.posed.children if e.attrs.get('name') == f'arm-{side}.full'][0]
        add(short, 'opacity', lambda fr, hand=hand: 1.0 if int(round(val(hand, fr))) else 0.0, kind='hold')
        add(full, 'opacity', lambda fr, hand=hand: 0.0 if int(round(val(hand, fr))) else 1.0, kind='hold')
    on = lambda fr: 1.0 if (val('rOn', fr) > 0.5 or val('lOn', fr) > 0.5) else 0.0  # noqa: E731
    add(sc.posed, 'opacity', on, kind='hold')
    add(sc.restBody, 'opacity', lambda fr: 1.0 - on(fr), kind='hold')
    if sc.prayer is not None:
        add(sc.prayer, 'opacity', lambda fr: 1.0 if (int(round(val('rHand', fr))) == 7 and int(round(val('lHand', fr))) == 7) else 0.0, kind='hold')
    # mouth solo
    mkeys = []
    last = None
    for fr in grid:
        pick = sc.mouths[MOUTH_PICK.get(int(round(val('mouth', fr))), 'mouth')].id
        if pick != last:
            mkeys.append((fr, pick, 's'))
            last = pick
    anim.key(sc.solo, 'activeComponentId', mkeys, kind='id')
    # fx stars
    for i, st in enumerate(sc.stars):
        strength = lambda fr: clamp(val('fxSparkle', fr) + val('fxStar', fr), 0, 1)  # noqa: E731
        add(st, 'opacity', strength, eps=0.01)
        add(st, 'scaleX', lambda fr, i=i: 0.4 + 0.6 * clamp(val('fxSparkle', fr) + val('fxStar', fr), 0, 1), eps=0.01)
        add(st, 'scaleY', lambda fr, i=i: 0.4 + 0.6 * clamp(val('fxSparkle', fr) + val('fxStar', fr), 0, 1), eps=0.01)
        add(st, 'rotation', lambda fr, i=i: (fr / 60.0) * (1.6 if i % 2 else -1.4) * clamp(val('fxSparkle', fr) + val('fxStar', fr), 0, 1), eps=0.01)

    touched = set()
    for (eid, prop), (el, _prop, series, kind, eps) in contrib.items():
        base = sc.rest_of(el, prop)
        # skip properties that never leave their rest value in this action (keeps files small)
        if kind != 'hold' and all(abs(v - base) < 1e-6 for _, v in series):
            continue
        if kind == 'hold' and len({round(v, 4) for _, v in series}) == 1 and abs(series[0][1] - base) < 1e-6:
            continue
        if kind == 'hold':
            keys, last = [], None
            for fr, v in series:
                if v != last:
                    keys.append((fr, v, 's'))
                    last = v
            if keys and keys[0][0] != 0:
                keys.insert(0, (0, series[0][1], 's'))
        else:
            if kind == 'smooth':  # discrete target -> eased value (quick, 4-frame time constant)
                sm, cur = [], series[0][1]
                for fr, v in series:
                    cur += (v - cur) * 0.55
                    sm.append((fr, cur))
                series = sm
            keys = [(fr, v, 'l') for fr, v in simplify(series, eps)]
        anim.key(el, prop, keys)
        touched.add((eid, prop))
    anim.touched = touched
    return anim, set(unsupported)


SUPPORTED = {'bodyY', 'torsoRot', 'torsoX', 'scale', 'headRot', 'headNod', 'headX', 'gazeX', 'gazeY',
             'rOn', 'rA', 'rE', 'rW', 'rHand', 'lOn', 'lA', 'lE', 'lW', 'lHand', 'armFront',
             'eyeL', 'eyeR', 'mouth', 'fxSparkle', 'fxStar'}


# --------------------------------------------------------------------------------------
# idle layers (native Rive keys: cubic easing, desynchronised loop lengths)
# --------------------------------------------------------------------------------------
def build_idle(sc: Scene) -> list[Anim]:
    out = []
    # 1) breathing + weight shift (3.6 s)
    a = Anim('idle.breath', f(3.6), True)
    n = f(3.6)
    a.key(sc.figIdle, 'scaleY', [(0, 1.0, 'io'), (n // 2, 1.011, 'io'), (n, 1.0, 'io')])
    a.key(sc.figIdle, 'scaleX', [(0, 1.0, 'io'), (n // 2, 1.003, 'io'), (n, 1.0, 'io')])
    a.key(sc.figIdle, 'rotation', [(0, 0.0, 'io'), (n // 2, 0.004, 'io'), (n, 0.0, 'io')])
    a.key(sc.badge, 'rotation', swing_keys(n, 1, 0.05, 0.6))
    a.key(sc.strap, 'rotation', swing_keys(n, 1, 0.012, 1.2))
    a.key(sc.headIdle, 'rotation', [(0, -0.004, 'io'), (n // 2, 0.006, 'io'), (n, -0.004, 'io')])
    out.append(a)
    # 2) hair + ribbon secondary motion (4.4 s, different length => never in lock-step)
    n = f(4.4)
    a = Anim('idle.hair', n, True)
    a.key(sc.hairL, 'rotation', swing_keys(n, 2, 0.045, 0.0))
    a.key(sc.hairR, 'rotation', swing_keys(n, 2, 0.045, 1.4))
    a.key(sc.ribbon, 'rotation', swing_keys(n, 3, 0.035, 0.7))
    out.append(a)
    # 3) micro gaze wander (7 s)
    n = f(7.0)
    a = Anim('idle.look', n, True)
    pts = [(0, 0, 0), (0.18, 2.2, -1.0), (0.4, -1.8, 0.6), (0.62, 1.0, 1.2), (0.85, -0.6, -0.4), (1.0, 0, 0)]
    for side in ('l', 'r'):
        lk = sc.eye[side]['look']
        a.key(lk, 'x', [(round(n * t), x, 'o') for t, x, y in pts])
        a.key(lk, 'y', [(round(n * t), y, 'o') for t, x, y in pts])
    out.append(a)
    # 4) blink loop (5.3 s, a double blink at the end)
    n = f(5.3)
    a = Anim('idle.blink', n, True)

    def blink_keys(t0s):
        k = [(0, 1.0, 's')]
        for t0 in t0s:
            k += [(f(t0), 1.0, 'o'), (f(t0) + 5, 0.08, 's'), (f(t0) + 8, 0.08, 'io'), (f(t0) + 16, 1.0, 's')]
        k.append((n, 1.0, 'l'))
        return k

    for side in ('l', 'r'):
        a.key(sc.eye[side]['blink'], 'scaleY', blink_keys([2.1, 4.5, 4.95]))
    out.append(a)
    return out


# --------------------------------------------------------------------------------------
# state machine
# --------------------------------------------------------------------------------------
VM_ID, VM_INST = '0:9000', '0:9001'


def build_view_model(act: dict[str, Anim]):
    """View model 'Mascot': one trigger property per action (host: vmi.trigger('wave').trigger())."""
    vm = El('ViewModel', 'Mascot', id=VM_ID)
    vm.attrs['defaultInstanceId'] = VM_INST
    props = {}
    inst = El('ViewModelInstance', 'Default', id=VM_INST, exports=True)
    for aid in act:
        pr = El('ViewModelPropertyTrigger', aid, ident=True)
        vm.add(pr)
        props[aid] = pr
        inst.add(El('ViewModelInstanceTrigger', viewModelPropertyId=pr.id))
    vm.add(inst)
    return vm, props


def trigger_condition(vm_id: str, prop_id: str) -> El:
    c = El('TransitionViewModelCondition')
    cmp_ = El('TransitionPropertyViewModelComparator')
    bp = El('BindablePropertyTrigger')
    bp.add(El('DataBindContext', sourcePathIds=f'{vm_id}-{prop_id}', propertyKey=686))
    cmp_.add(bp)
    c.add(cmp_, El('TransitionValueTriggerComparator'))
    return c


def build_state_machine(sc: Scene, idle: list[Anim], act: dict[str, Anim], rest: Anim, vm_props) -> El:
    sm = El('StateMachine', 'Nomi', id='0:7')
    for k, an in enumerate(idle):  # one always-on looping layer per idle track
        ly = El('StateMachineLayer', an.name, ident=True)
        st = El('AnimationState', ident=True, x=200, y=100 * k, animationId=an.el.id)
        entry = El('EntryState')
        entry.add(El('StateTransition', stateToId=st.id))
        ly.add(El('AnyState', x=0, y=-100), El('ExitState', x=400, y=-100), entry, st)
        sm.add(ly)
    ly = El('StateMachineLayer', 'Actions', ident=True)
    rest_st = El('AnimationState', ident=True, x=200, y=0, animationId=rest.el.id)
    states = {}
    for i, (aid, an) in enumerate(act.items()):
        states[aid] = El('AnimationState', ident=True, x=520, y=-160 + i * 100, animationId=an.el.id)
    entry = El('EntryState')
    entry.add(El('StateTransition', stateToId=rest_st.id))
    for aid, st in states.items():
        tr = El('StateTransition', stateToId=st.id, duration=0)
        tr.add(trigger_condition(VM_ID, vm_props[aid].id))
        rest_st.add(tr)
        st.add(El('StateTransition', stateToId=rest_st.id, duration=0, enableExitTime=True,
                  exitTimeIsPercetange=True, exitTime=100))
    ly.add(El('AnyState', x=0, y=-100), El('ExitState', x=400, y=-100), entry, rest_st, *states.values())
    sm.add(ly)
    return sm


def build_rest(sc: Scene, act: dict[str, Anim]) -> Anim:
    rest = Anim('rest', 1, True)
    touched = {}
    for an in act.values():
        for eid, (el, props) in an.items.items():
            for prop, (kind, keys) in props.items():
                touched[(eid, prop)] = (el, prop, kind)
    for (eid, prop), (el, p, kind) in touched.items():
        if kind == 'id':
            rest.key(el, p, [(0, sc.mouths['mouth'].id, 's')], kind='id')
        else:
            v = sc.rest_of(el, p)
            if el is sc.posed and p == 'opacity':
                v = 0.0
            rest.key(el, p, [(0, v, 'l')])
    # explicit rest values that differ from authored attrs
    return rest


def main(action_ids: list[str]):
    import subprocess
    out = subprocess.run(['npx', 'tsx', str(ROOT / 'scripts/rive-eval/export-actions.mts'), *action_ids],
                         capture_output=True, text=True, cwd=ROOT, check=True).stdout
    defs = json.loads(out)
    (PROJ).mkdir(parents=True, exist_ok=True)
    (PROJ / 'actions.json').write_text(json.dumps(defs, indent=1))
    sc = Scene(defs)
    ab = sc.ab
    idle = build_idle(sc)
    act, unsupported = {}, {}
    for d in defs:
        an, un = build_action_anim(sc, d)
        act[d['id']] = an
        unsupported[d['id']] = sorted(un)
    rest = build_rest(sc, act)
    vm, vm_props = build_view_model(act)
    sm = build_state_machine(sc, idle, act, rest, vm_props)
    for an in [*idle, rest, *act.values()]:
        ab.add(an.finish())
    ab.add(sm)
    ab.attrs['defaultStateMachineId'] = '0:7'
    ab.attrs['viewModelId'] = VM_ID
    PROJ.mkdir(parents=True, exist_ok=True)
    (PROJ / 'rive.yaml').write_text('name: nomi-poc\nlogs:\n  file: build/rive.log\n  problems: build/problems.log\n')
    body = '<Rive version="1" kind="fragment">\n'
    for a_ in asset_els.values():
        body += a_.emit(1)
    body += vm.emit(1)
    body += ab.emit(1)
    body += '</Rive>\n'
    (PROJ / 'scene.rml').write_text(body)
    print('wrote', PROJ / 'scene.rml', 'actions:', list(act), 'unsupported params:', unsupported)
    print('mesh vertices total:', sum(getattr(a, 'vertex_count', 0) for a in sc.arms.values()))


if __name__ == '__main__':
    main(sys.argv[1:] or ['wave', 'hello', 'nod', 'think', 'pray', 'cheer', 'thumbs_up', 'celebrate'])
