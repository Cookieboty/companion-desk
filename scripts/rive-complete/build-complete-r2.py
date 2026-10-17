#!/usr/bin/env python3
"""Generate rive/nomi-complete/{rive.yaml,scene.rml}: upper-body Nomi on COMPLETED parts.

Layers (back -> front): torso flanks (official-derived) / hands / completed arm meshes (3 bones: shoulder, elbow, wrist) /
body-noarm / strap + badge / head group.   Animations: idle (breath, sway, hair), wave (screen-right arm), cheer (both arms),
poses sampled from the canvas rig's own wave / celebrate tracks (scripts/rive-complete/harness/dump-params.js).
Run:  python3 scripts/rive-complete/make_sleeve_solid.py && make_arm_parts.py && make_hand_parts.py && build-complete.py
      ~/.rive/bin/rive rive/nomi-complete --once
"""
from __future__ import annotations
import base64, json, math, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); sys.path.insert(0, str(Path(__file__).parents[1] / 'rive-eval'))
from rml import El
from rc_common import *

PROJ = ROOT / 'rive/nomi-complete'
PARAMS = Path(os.environ.get('RC_PARAMS', str(ROOT / 'rive/nomi-complete/data')))
AB_W, AB_H = 960, 1300
FIG = (480.0, 1120.0)
NECK = (474.0, 395.52)
P_BY = {p['id']: p for p in PJ['parts']}
S_ELBOW = 340.0
STRAP_C = {'l': (128.0, 1127.0), 'r': (812.0, 1127.0)}
WRIST_PT = {'l': (147.0, 1196.0), 'r': (799.0, 1196.0)}
HANDS = json.loads((PARTS / 'hands.json').read_text())
ZF = 0.8   # forearm foreshortening at z=1 (canvas rig: 0.45, but its forearm ends at the hand piece; ours includes the cuff, so it is shorter on screen)
CHAR_SIDE = {'r': 'L', 'l': 'R'}   # rig 'r' arm = screen-right = character's LEFT; never swapped

# ---------------------------------------------------------------- assets
assets: dict[str, El] = {}
def asset(key, rel):
    if key not in assets:
        assets[key] = El('ImageAsset', key, ident=True, file=rel)
    return assets[key]
def layer_asset(n): return asset(n, f'official/{P_BY[n]["file"]}')
def part_asset(n): return asset(n, f'parts/{n}.png')

def rel(a, b): return (a[0] - b[0], a[1] - b[1])
def node(name, pos, parent, **kw):
    r = rel(pos, parent); return El('Node', name, ident=True, x=r[0], y=r[1], **kw)
def image(name, parent_abs, **kw):
    p = P_BY[name]; r = rel(p['offset'], parent_abs)
    el = El('Image', name, ident=True, assetId=layer_asset(name).need_id(), x=r[0], y=r[1], originX=0, originY=0, **kw)
    if p['scale'] != 1: el.attrs['scaleX'] = el.attrs['scaleY'] = p['scale']
    return el
def back_to_front(parent, *kids):
    parent.add(*reversed(kids)); return parent
def smooth01(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def varuint(n):
    out = bytearray()
    while True:
        b = n & 0x7F; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); return bytes(out)
def ns_of(a, x, y):
    dx, dy = x - a['s0'][0], y - a['s0'][1]
    return dx * a['w'][0] + dy * a['w'][1], dx * a['u'][0] + dy * a['u'][1]

# ---------------------------------------------------------------- arm
class Arm:
    def __init__(self, side):
        self.side = side; a = self.a = arm_geom(side); self.sg = a['sg']
        self.P = tuple(a['pivot']); Sc = STRAP_C[side]
        _, sP = ns_of(a, *self.P); _, sS = ns_of(a, *Sc)
        t = (S_ELBOW - sP) / (sS - sP)
        self.E = (self.P[0] + (Sc[0] - self.P[0]) * t, self.P[1] + (Sc[1] - self.P[1]) * t)
        self.W = WRIST_PT[side]
        d1 = rel(self.E, self.P); d2 = rel(self.W, self.E)
        self.L1, self.L2, self.L3 = math.hypot(*d1), math.hypot(*d2), 70.0
        self.a1 = math.atan2(d1[1], d1[0]); self.a2 = math.atan2(d2[1], d2[0])
        self.rest2 = self.a2 - self.a1
        self.tex = cv2.imread(str(PARTS / f'arm-{side}-complete.png'), cv2.IMREAD_UNCHANGED)
        self.sE = ns_of(a, *self.E)[1]
        self.bones: dict[str, El] = {}
        self.verts = 0

    def make_rig(self, fig_abs):
        """Three independent RootBones (shoulder / elbow / wrist) under the arm node. A nested chain would make the
        foreshortening scaleX of a parent shear its rotated child (Rive has no skew), which tore the sleeve in the
        first version; the joint positions are therefore keyed from the FK solution (see ik_arm) instead."""
        n = node(f'arm-{self.side}.rig', self.P, fig_abs)
        ex, ey = self.E[0] - self.P[0], self.E[1] - self.P[1]; wx, wy = self.W[0] - self.P[0], self.W[1] - self.P[1]
        sh = El('RootBone', f'arm-{self.side}.shoulder', ident=True, x=0, y=0, rotation=self.a1, length=self.L1)
        el = El('RootBone', f'arm-{self.side}.elbow', ident=True, x=ex, y=ey, rotation=self.a2, length=self.L2)
        wr = El('RootBone', f'arm-{self.side}.wrist', ident=True, x=wx, y=wy, rotation=self.a2, length=self.L3)
        n.add(sh, el, wr)
        # front copy of the wrist bone: raised hands (wave / fist) are drawn above the head and hair, the resting hand
        # stays under the cuff lining inside the arm layer
        nf = node(f'arm-{self.side}.rigF', self.P, fig_abs)
        wf = El('RootBone', f'arm-{self.side}.wristF', ident=True, x=wx, y=wy, rotation=self.a2, length=self.L3)
        nf.add(wf)
        self.bones = dict(sh=sh, el=el, wr=wr, wrF=wf); self.rig = n; self.rigF = nf
        return n

    def weights(self, s):
        w3 = smooth01((s - 715) / 70)
        w2 = smooth01((s - (self.sE - 55)) / 110) * (1 - w3)
        w1 = 1 - w2 - w3
        vals = [int(round(255 * v)) for v in (w1, w2, w3)]; vals[0] += 255 - sum(vals)
        return sum(v << (8 * i) for i, v in enumerate(vals)), sum((i + 1) << (8 * i) for i in range(3))

    def mesh_image(self, fig_abs):
        a = self.a; Ht, Wt = self.tex.shape[:2]
        M = tex_to_rig_affine(a)
        al = self.tex[..., 3] > 8
        ys, xs = np.where(al)
        x0, x1, y0, y1 = max(xs.min() - 4, 0), min(xs.max() + 4, Wt - 1), max(ys.min() - 4, 0), min(ys.max() + 4, Ht - 1)
        cols = 8
        cx = [x0 + (x1 - x0) * i / (cols - 1) for i in range(cols)]
        ry = set([y0, y1])
        y = y0
        while y < y1: ry.add(round(y)); y += 34
        yE = self.sE - TEX_S0
        y = yE - 90
        while y <= yE + 90: ry.add(round(y)); y += 8
        y = 715 - TEX_S0
        while y <= 790 - TEX_S0: ry.add(round(y)); y += 20
        ry = sorted(r for r in ry if y0 <= r <= y1)
        R, C = len(ry), len(cx)
        verts = []
        for yy in ry:
            for xx in cx:
                rx = M[0, 0] * xx + M[0, 1] * yy + M[0, 2]; rY = M[1, 0] * xx + M[1, 1] * yy + M[1, 2]
                verts.append((rx, rY, xx / Wt, yy / Ht, TEX_S0 + yy))
        idx = lambda r, c: r * C + c
        bset = {idx(r, c) for r in range(R) for c in range(C) if r in (0, R - 1) or c in (0, C - 1)}
        order = sorted(bset) + [i for i in range(len(verts)) if i not in bset]
        newi = {o: n for n, o in enumerate(order)}
        tri = bytearray()
        for r in range(R - 1):
            for c in range(C - 1):
                p0, p1, p2, p3 = idx(r, c), idx(r, c + 1), idx(r + 1, c + 1), idx(r + 1, c)
                for t3 in ((p0, p1, p2), (p0, p2, p3)):
                    for v in t3: tri += varuint(newi[v])
        el = El('Image', f'arm-{self.side}.complete', ident=True, assetId=part_asset(f'arm-{self.side}-complete').need_id(),
                x=-fig_abs[0], y=-fig_abs[1], originX=0, originY=0)
        mesh = El('Mesh', 'Mesh', triangleIndexBytes=base64.b64encode(bytes(tri)).decode())
        for i in order:
            rx, rY, u, v, s = verts[i]
            vals, inds = self.weights(s)
            vtx = El('ContourMeshVertex' if i in bset else 'MeshVertex', x=rx, y=rY, u=u, v=v)
            vtx.add(El('Weight', values=vals, indices=inds)); mesh.add(vtx)
        self.verts = len(verts)
        el.add(mesh)
        sk = El('Skin', 'Skin', xx=1, xy=0, yx=0, yy=1, tx=0, ty=0)
        for nm, (ang, org) in (('shoulder', (self.a1, self.P)), ('elbow', (self.a2, self.E)), ('wrist', (self.a2, self.W))):
            c, s_ = math.cos(ang), math.sin(ang)
            bid = {'shoulder': 'sh', 'elbow': 'el', 'wrist': 'wr'}[nm]
            sk.add(El('Tendon', nm, boneId=self.bones[bid].need_id(), xx=c, xy=s_, yx=-s_, yy=c, tx=org[0], ty=org[1]))
        mesh.add(sk)
        return el

    def make_hands(self):
        self.hand_nodes = {}
        for hn in ('rest', 'wave', 'fist'):
            m = HANDS[hn]
            flip = m['side'] != 'S' and m['side'] != CHAR_SIDE[self.side]
            hs = m['scale']
            # tuck the extended wrist stub under the orange cuff lining: pull along the bone toward the elbow
            # (wrist RootBone +x points along the forearm). Scale up a bit so fingers stay crisp after downsample.
            hs = m['scale'] * 1.12
            tuck = -28.0   # px toward elbow / under cuff
            node_ = El('Node', f'hand-{self.side}.{hn}', ident=True, x=tuck, y=0, rotation=math.pi / 2,
                       scaleX=-hs if flip else hs, scaleY=hs, opacity=1.0 if hn == 'rest' else 0.0)
            im = El('Image', f'hand-{hn}', assetId=part_asset(f'hand-{hn}').need_id(), x=0, y=0,
                    originX=m['ax'] / m['w'], originY=m['ay'] / m['h'])
            node_.add(im)
            self.bones['wr' if hn == 'rest' else 'wrF'].add(node_)
            self.hand_nodes[hn] = node_
            node_.flip = flip

    def make_cuff_overlay(self):
        """Official cuff tip (strap+buckle+orange lining) drawn ABOVE the hand so the wrist stub never shows as a flesh block."""
        arm = cv2.imread(str(PARTS / f'arm-{self.side}-complete.png'), cv2.IMREAD_UNCHANGED)
        # cuff band approx tex y 820..920
        cuff = arm[800:940].copy()
        # fade top into sleeve
        for i in range(20):
            cuff[i, ..., 3] = (cuff[i, ..., 3].astype(np.float32) * (i / 20)).astype(np.uint8)
        path = PARTS / f'cuff-overlay-{self.side}.png'
        cv2.imwrite(str(path), cuff)
        part_asset(f'cuff-overlay-{self.side}')
        self.cuff_overlay = El('Node', f'arm-{self.side}.cuffOverlay', ident=True, x=-8, y=0, rotation=0.0, opacity=0.0)
        im = El('Image', f'cuff-ov-{self.side}', assetId=part_asset(f'cuff-overlay-{self.side}').need_id(),
                x=0, y=0, originX=0.5, originY=0.85, scaleX=0.42, scaleY=0.42)
        self.cuff_overlay.add(im)
        self.bones['wrF'].add(self.cuff_overlay)

    def make_elbow_patch(self):
        """Overlay a bent-sleeve crease near the elbow bone; opacity keyed later in build_action."""
        self.elbow_patch = El('Node', f'arm-{self.side}.elbowPatch', ident=True, x=0, y=0, opacity=0.0)
        im = El('Image', f'elbow-bent-{self.side}', assetId=part_asset(f'elbow-bent-patch-{self.side}').need_id(),
                x=0, y=0, originX=0.5, originY=0.5, scaleX=0.55, scaleY=0.55)
        self.elbow_patch.add(im)
        self.bones['el'].add(self.elbow_patch)

    def fk(self, d1, d2, d3=0.0):
        a_sh = self.a1 + d1
        e = (self.P[0] + self.L1 * math.cos(a_sh), self.P[1] + self.L1 * math.sin(a_sh))
        a_fa = a_sh + self.rest2 + d2
        return e, (e[0] + self.L2 * math.cos(a_fa), e[1] + self.L2 * math.sin(a_fa)), a_fa

# ---------------------------------------------------------------- animation machinery
CURVES = {'io': (0.42, 0, 0.58, 1), 'o': (0, 0, 0.58, 1), 'i': (0.42, 0, 1, 1)}
class Anim:
    def __init__(self, name, frames, loop):
        self.el = El('LinearAnimation', name, ident=True, loopValue='loop' if loop else 'oneShot', duration=int(frames), fps=60)
        self.items = {}; self.name = name; self.frames = int(frames)
    def key(self, target, prop, keys):
        _, props = self.items.setdefault(target.need_id(), (target, {}))
        props[prop] = sorted(keys, key=lambda k: k[0])
    def finish(self):
        for el, props in self.items.values():
            ko = El('KeyedObject', objectId=el.id)
            for prop, keys in props.items():
                kp = El('KeyedProperty', property=prop)
                for fr, v, e in keys:
                    kf = El('KeyFrameDouble', value=v, frame=int(fr))
                    if e == 's': kf.attrs['interpolationType'] = 'hold'
                    elif e == 'l': kf.attrs['interpolationType'] = 'linear'
                    else:
                        kf.attrs['interpolationType'] = 'cubic'
                        x1, y1, x2, y2 = CURVES[e]; kf.add(El('CubicEaseInterpolator', x1=x1, y1=y1, x2=x2, y2=y2))
                    kp.add(kf)
                ko.add(kp)
            self.el.add(ko)
        return self.el

def simplify(pts, eps):
    """Ramer-Douglas-Peucker on [(frame, value)]"""
    if len(pts) < 3: return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dmax, im = 0, 0
    for i in range(1, len(pts) - 1):
        t = (pts[i][0] - x0) / max(x1 - x0, 1e-9); yy = y0 + (y1 - y0) * t
        d = abs(pts[i][1] - yy)
        if d > dmax: dmax, im = d, i
    if dmax <= eps: return [pts[0], pts[-1]]
    return simplify(pts[:im + 1], eps)[:-1] + simplify(pts[im:], eps)

def swing(frames, cycles, amp, phase=0.0, base=0.0, n_per=4):
    n = cycles * n_per; keys = []
    for i in range(n + 1):
        t = i / n; keys.append((round(frames * t), base + amp * math.sin(2 * math.pi * cycles * t + phase), 'io'))
    keys[-1] = (frames, keys[0][1], 'io'); return keys

# ---------------------------------------------------------------- scene
class Scene:
    def __init__(self):
        self.ab = El('Artboard', 'Nomi', width=AB_W, height=AB_H, styleId='0:5'); self.ab.attrs['id'] = '0:2'; self.ab.id = '0:2'
        self.ab.add(El('LayoutComponentStyle', 'Artboard Style', id='0:5'))
        self.rest: dict = {}
        self.build()

    def build(self):
        ab = self.ab
        self.figIdle = node('fig.idle', FIG, (0, 0)); self.figAct = node('fig.act', FIG, FIG); self.figIdle.add(self.figAct)
        self.arms = {'l': Arm('l'), 'r': Arm('r')}
        rigs, meshes = [], []
        for s, arm in self.arms.items():
            rigs.append(arm.make_rig(FIG)); arm.make_cuff_overlay(); arm.make_hands(); arm.make_elbow_patch(); meshes.append(arm.mesh_image(FIG))
        flank_l = image('body-flank-l', FIG); flank_r = image('body-flank-r', FIG)
        # raised-arm shoulder gussets (official flank + orange lining), start hidden; opacity keyed to arm raise
        self.gusset = {}
        for sd in ('l', 'r'):
            pivot = self.arms[sd].P
            # shift slightly toward body midline and down into the armpit
            mid = 476.0
            gx = pivot[0] + (12 if sd == 'r' else -12) * (1 if sd == 'r' else 1)
            gx = pivot[0] + (18 if sd == 'r' else -18)
            gy = pivot[1] + 40
            gn = node(f'gusset-{sd}', (gx, gy), FIG, opacity=0.0)
            gim = El('Image', f'gusset-{sd}-img', assetId=part_asset(f'shoulder-gusset-{sd}-raised').need_id(),
                     x=0, y=0, originX=0.5, originY=0.15, scaleX=0.85 if sd == 'r' else -0.85, scaleY=0.85)
            gn.add(gim); self.gusset[sd] = gn
        body = image('body-noarm', FIG)
        self.badge = node('badge.idle', tuple(P_BY['badge']['pivot']), FIG); self.badge.add(image('badge', tuple(P_BY['badge']['pivot'])))
        self.strap = node('strap-r.idle', tuple(P_BY['strap-r']['pivot']), FIG); self.strap.add(image('strap-r', tuple(P_BY['strap-r']['pivot'])))
        # head
        self.headIdle = node('head.idle', NECK, FIG); self.headAct = node('head.act', NECK, NECK); self.headIdle.add(self.headAct)
        self.tails = {}
        tail_nodes = []
        for sd in ('l', 'r'):
            root = tuple(PJ['chains'][f'hair-tail-{sd}']['root'])
            tn = node(f'tail-{sd}.idle', root, NECK); tn.add(image(f'hair-tail-{sd}', root)); self.tails[sd] = tn; tail_nodes.append(tn)
        feats = []
        self.eye = {}
        for sd in ('l', 'r'):
            m = PJ['eyes'][sd]; cx = (m['x0'] + m['x1']) / 2; ep = (cx, m['top'])
            blink = node(f'eye-{sd}.blink', ep, NECK); look = node(f'iris-{sd}.look', ep, ep)
            look.add(image(f'iris-{sd}', ep))
            back_to_front(blink, image(f'eye-white-{sd}', ep), look, image(f'lash-{sd}', ep))
            feats.append(blink); self.eye[sd] = dict(blink=blink, look=look)
        mouth = image('mouth', NECK)
        self.ribbon = node('ribbon.idle', tuple(PJ['joints']['ribbonKnot']), NECK)
        self.ribbon.add(image('ribbon', tuple(PJ['joints']['ribbonKnot'])))
        back_to_front(self.headAct, *tail_nodes, image('head', NECK), image('crown', NECK), *feats, mouth, image('bangs', NECK),
                      image('clip', NECK), self.ribbon, image('earring', NECK))
        # z: back -> front
        back_to_front(self.figAct, flank_l, flank_r, self.gusset['l'], self.gusset['r'],
                      rigs[0], rigs[1], meshes[0], meshes[1], body, self.strap, self.badge, self.headIdle,
                      self.arms['l'].rigF, self.arms['r'].rigF)
        ab.add(self.figIdle)
        if os.environ.get('RC_BG'):   # review renders only: opaque cream backdrop so CLI frames match the canvas rig's bg
            bg = El('Shape', 'review.bg', ident=True, x=0, y=0)
            bg.add(El('Rectangle', 'r', originX=0, originY=0, width=AB_W, height=AB_H))
            f = El('Fill', 'f'); f.add(El('SolidColor', 'c', colorValue='FFF6EFE8')); bg.add(f)
            ab.add(bg)   # Rive paints the FIRST child on top, so the backdrop goes last
        self.flank_l, self.flank_r = flank_l, flank_r

    def rest_of(self, el, prop):
        if prop in el.attrs: return float(el.attrs[prop])
        return {'scaleX': 1, 'scaleY': 1, 'opacity': 1}.get(prop, 0.0)

# ---------------------------------------------------------------- actions from the canvas rig's own tracks
def load_rows(name):
    return json.loads((PARAMS / f'{name}.json').read_text())


MID_X2 = 2 * 476.0   # mirror axis between the two shoulder pivots (rig x)
HAND_XMIN = 745.0
HAND_D = 52.0   # cuff rim offset from canvas hand anchor; smaller = hand sits closer under cuff   # canvas hand anchor -> cuff rim distance (rig px)
def _unwrap(v):
    out = [v[0]]
    for x in v[1:]:
        while x - out[-1] > math.pi: x -= 2 * math.pi
        while x - out[-1] < -math.pi: x += 2 * math.pi
        out.append(x)
    return out

def ik_arm(arm, rows, pre, fu, ff, Zs):
    """Place this arm's wrist where the canvas rig's hand is (same timestamps), solving a 2-link IK per frame.
    Returns absolute bone rotations (shoulder world angle, elbow local angle, wrist local delta)."""
    r0 = rows[0]
    def tgt(r):
        h = r['hand']
        return (h['hx'] + HAND_D * math.sin(h['hPsi']), h['hy'] - HAND_D * math.cos(h['hPsi']))
    t0 = tgt(r0)
    flip = -1.0 if arm.side == 'l' else 1.0     # mirror the screen-right ('r') target for the screen-left arm
    P = arm.P; Wrest = arm.W
    A, E, W = [], [], []
    th_rest = 0
    prevA = None
    for r, u, f, z in zip(rows, fu, ff, Zs):
        t = tgt(r)
        # absolute canvas target (mirrored for the screen-left arm); blended to this arm's own rest wrist while z~0,
        # because our draft-length arm hangs ~190 px lower than the canvas chibi arm at rest
        tx = t[0] if flip > 0 else MID_X2 - t[0]
        ox = t0[0] if flip > 0 else MID_X2 - t0[0]
        zb = max(0.0, min(1.0, z / 0.8))
        tx = max(tx, HAND_XMIN) if flip > 0 else min(tx, MID_X2 - HAND_XMIN)   # keep the (larger) hand off the face
        T = (tx + (1 - zb) * (Wrest[0] - ox), t[1] + (1 - zb) * (Wrest[1] - t0[1]))
        l1, l2 = arm.L1 * u, arm.L2 * f
        dx, dy = T[0] - P[0], T[1] - P[1]
        d = max(abs(l1 - l2) + 1.0, min(l1 + l2 - 0.5, math.hypot(dx, dy)))
        th = math.atan2(dy, dx)
        al = math.acos(max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
        cands = []
        for sgn in (1, -1):
            a1w = th + sgn * al
            ex, ey = P[0] + l1 * math.cos(a1w), P[1] + l1 * math.sin(a1w)
            a2w = math.atan2(T[1] - ey, T[0] - ex)
            e = a2w - a1w
            while e > math.pi: e -= 2 * math.pi
            while e < -math.pi: e += 2 * math.pi
            cands.append((a1w, e, a2w))
        # canvas elbow bend sign (positive canvas e = forearm turns toward the head) -> local rotation sign -sg
        want = -arm.sg * (1 if r[pre + 'E'] >= 0 else -1)
        ok = ([c for c in cands if (c[1] > 0) == (want > 0)] if abs(r[pre + 'E']) > 3 else cands) or cands
        c = min(ok, key=lambda c: abs(c[0] - (prevA if prevA is not None else arm.a1)))
        prevA = c[0]
        hp = r['hand']['hPsi']
        thh = math.atan2(-math.cos(hp), math.sin(hp))
        thh_eff = thh if arm.side == 'r' else (math.pi - thh if True else thh)
        A.append(c[0]); E.append(c[2])
        W.append(thh_eff - c[2])
    A = _unwrap(A)
    W0 = W[0]; W = _unwrap([w - W0 for w in W])
    return A, _unwrap(E), W

def build_action(sc: Scene, name: str, src: str, sides: dict[str, str], hand: str):
    d = load_rows(src); rows = d['rows']; n = len(rows) - 1
    an = Anim(name, n, False)
    gain = 1.0
    def track(vals, eps):
        pts = [(r['f'], v) for r, v in zip(rows, vals)]
        return simplify(pts, eps)
    for side, pre in sides.items():
        arm = sc.arms[side]; sg = arm.sg
        Z = [0.0 if os.environ.get('RC_NOZ') else max(0.0, min(1.0, r[pre + 'Z'])) for r in rows]
        fu = [1 - 0.7 * z for z in Z]; ff = [1 - ZF * z for z in Z]
        Ab, Eb, Wb = ik_arm(arm, rows, pre, fu, ff, Z)
        mix = [r[pre + 'Mix'] for r in rows]
        # independent root bones: key joint positions from FK (P fixed; elbow/wrist follow the scaled links)
        ex = []; ey = []; wx = []; wy = []
        for a1w, a2w, u, f in zip(Ab, Eb, fu, ff):
            e = (arm.L1 * u * math.cos(a1w), arm.L1 * u * math.sin(a1w))
            w = (e[0] + arm.L2 * f * math.cos(a2w), e[1] + arm.L2 * f * math.sin(a2w))
            ex.append(e[0]); ey.append(e[1]); wx.append(w[0]); wy.append(w[1])
        an.key(arm.bones['sh'], 'scaleX', [(f, v, 'l') for f, v in track(fu, 0.01)])
        an.key(arm.bones['el'], 'scaleX', [(f, v, 'l') for f, v in track(ff, 0.01)])
        an.key(arm.bones['sh'], 'rotation', [(f, v, 'l') for f, v in track(Ab, 0.004)])
        an.key(arm.bones['el'], 'rotation', [(f, v, 'l') for f, v in track(Eb, 0.004)])
        an.key(arm.bones['wr'], 'rotation', [(f, v, 'l') for f, v in track([a + w for a, w in zip(Eb, Wb)], 0.004)])
        an.key(arm.bones['wrF'], 'rotation', [(f, v, 'l') for f, v in track([a + w for a, w in zip(Eb, Wb)], 0.004)])
        for bn, xs, ys in (('el', ex, ey), ('wr', wx, wy), ('wrF', wx, wy)):
            an.key(arm.bones[bn], 'x', [(f, v, 'l') for f, v in track(xs, 0.3)])
            an.key(arm.bones[bn], 'y', [(f, v, 'l') for f, v in track(ys, 0.3)])
        # hands: rest -> action hand crossfade by the canvas rig's own hand mix
        hv = [min(1.0, max(0.0, m)) for m in mix]
        # never leave a stump: wave hand is visible whenever mix>0.15; rest hand stays until wave is nearly solid
        an.key(arm.hand_nodes[hand], 'opacity', [(f, v, 'l') for f, v in track([min(1.0, max(0.0, (m-0.12)/0.55)) for m in mix], 0.02)])
        an.key(arm.hand_nodes['rest'], 'opacity', [(f, v, 'l') for f, v in track([1.0 if m < 0.85 else max(0.0, 1.0-(m-0.85)/0.15) for m in mix], 0.02)])
        # raised-arm detail: gusset fades in with z / raise; elbow crease with |E|
        raise_amt = [max(0.0, min(1.0, 0.55 * z + 0.55 * max(0.0, (abs(r[pre + 'A']) - 25) / 90))) for r, z in zip(rows, Z)]
        an.key(sc.gusset[side], 'opacity', [(f, v, 'l') for f, v in track(raise_amt, 0.02)])
        bend = [max(0.0, min(0.85, abs(r[pre + 'E']) / 70.0)) for r in rows]
        an.key(arm.elbow_patch, 'opacity', [(f, v, 'l') for f, v in track(bend, 0.02)])
        an.key(arm.cuff_overlay, 'opacity', [(f, v, 'l') for f, v in track([min(1.0, max(0.0, (m-0.12)/0.55)) for m in mix], 0.02)])


    # body bob / head
    an.key(sc.figAct, 'y', [(f, v, 'l') for f, v in track([r['bodyY'] for r in rows], 0.15)])
    an.key(sc.figAct, 'x', [(f, v, 'l') for f, v in track([r['torsoX'] for r in rows], 0.15)])
    an.key(sc.headAct, 'rotation', [(f, v, 'l') for f, v in track([r['headRot'] for r in rows], 0.004)])
    # right strap fades while the screen-right arm is raised (same rule as the canvas rig)
    if 'r' in sides:
        an.key(sc.strap, 'opacity', [(f, 1 - min(1.0, v), 'l') for f, v in track([r['rOn'] for r in rows], 0.02)])
    return an

def build_idle(sc: Scene):
    out = []; n = 216
    a = Anim('idle.breath', n, True)
    a.key(sc.figIdle, 'scaleY', [(0, 1.0, 'io'), (n // 2, 1.011, 'io'), (n, 1.0, 'io')])
    a.key(sc.figIdle, 'scaleX', [(0, 1.0, 'io'), (n // 2, 1.003, 'io'), (n, 1.0, 'io')])
    a.key(sc.headIdle, 'rotation', [(0, -0.012, 'io'), (n // 2, 0.014, 'io'), (n, -0.012, 'io')])
    a.key(sc.badge, 'rotation', swing(n, 1, 0.05, 0.6)); a.key(sc.strap, 'rotation', swing(n, 1, 0.012, 1.2))
    out.append(a)
    n = 264; a = Anim('idle.hair', n, True)
    a.key(sc.tails['l'], 'rotation', swing(n, 2, 0.05, 0.0)); a.key(sc.tails['r'], 'rotation', swing(n, 2, 0.05, 1.4))
    a.key(sc.ribbon, 'rotation', swing(n, 3, 0.035, 0.7))
    out.append(a)
    return out

def build_rest(sc, acts):
    rest = Anim('rest', 1, True); touched = {}
    for an in acts:
        for eid, (el, props) in an.items.items():
            for prop in props: touched[(eid, prop)] = (el, prop)
    for (eid, prop), (el, p) in touched.items():
        v = sc.rest_of(el, p)
        if p == 'rotation' and el.attrs.get('name', '').startswith('arm-'): v = float(el.attrs.get('rotation', 0))
        rest.key(el, p, [(0, v, 'l')])
    return rest

VM_ID, VM_INST = '0:9000', '0:9001'
def build_sm(idle, acts, rest):
    vm = El('ViewModel', 'Mascot', id=VM_ID); vm.attrs['defaultInstanceId'] = VM_INST
    inst = El('ViewModelInstance', 'Default', id=VM_INST, exports=True); props = {}
    for an in acts:
        pr = El('ViewModelPropertyTrigger', an.name, ident=True); vm.add(pr); props[an.name] = pr
        inst.add(El('ViewModelInstanceTrigger', viewModelPropertyId=pr.id))
    vm.add(inst)
    sm = El('StateMachine', 'Nomi', id='0:7')
    for k, an in enumerate(idle):
        ly = El('StateMachineLayer', an.name, ident=True)
        st = El('AnimationState', ident=True, x=200, y=100 * k, animationId=an.el.id)
        entry = El('EntryState'); entry.add(El('StateTransition', stateToId=st.id))
        ly.add(El('AnyState', x=0, y=-100), El('ExitState', x=400, y=-100), entry, st); sm.add(ly)
    ly = El('StateMachineLayer', 'Actions', ident=True)
    rest_st = El('AnimationState', ident=True, x=200, y=0, animationId=rest.el.id)
    states = {an.name: El('AnimationState', ident=True, x=520, y=-160 + i * 100, animationId=an.el.id) for i, an in enumerate(acts)}
    entry = El('EntryState'); entry.add(El('StateTransition', stateToId=rest_st.id))
    for nm, st in states.items():
        tr = El('StateTransition', stateToId=st.id, duration=0)
        c = El('TransitionViewModelCondition'); cmp_ = El('TransitionPropertyViewModelComparator'); bp = El('BindablePropertyTrigger')
        bp.add(El('DataBindContext', sourcePathIds=f'{VM_ID}-{props[nm].id}', propertyKey=686)); cmp_.add(bp)
        c.add(cmp_, El('TransitionValueTriggerComparator')); tr.add(c); rest_st.add(tr)
        st.add(El('StateTransition', stateToId=rest_st.id, duration=0, enableExitTime=True, exitTimeIsPercetange=True, exitTime=100))
    ly.add(El('AnyState', x=0, y=-100), El('ExitState', x=400, y=-100), entry, rest_st, *states.values()); sm.add(ly)
    return vm, sm

def main():
    sc = Scene()
    idle = build_idle(sc)
    wave = build_action(sc, 'wave', 'wave', {'r': 'r'}, 'wave')
    cheer = build_action(sc, 'cheer', 'celebrate', {'r': 'r', 'l': 'l'}, 'wave')
    acts = [wave, cheer]
    rest = build_rest(sc, acts)
    vm, sm = build_sm(idle, acts, rest)
    for an in [*idle, rest, *acts]: sc.ab.add(an.finish())
    sc.ab.add(sm); sc.ab.attrs['defaultStateMachineId'] = '0:7'; sc.ab.attrs['viewModelId'] = VM_ID
    PROJ.mkdir(parents=True, exist_ok=True)
    (PROJ / 'rive.yaml').write_text('name: nomi-complete\nlogs:\n  file: build/rive.log\n  problems: build/problems.log\n')
    body = '<Rive version="1" kind="fragment">\n'
    for a_ in assets.values(): body += a_.emit(1)
    body += vm.emit(1) + sc.ab.emit(1) + '</Rive>\n'
    (PROJ / 'scene.rml').write_text(body)
    print('wrote scene.rml; mesh verts', {s: a.verts for s, a in sc.arms.items()}, 'assets', len(assets), 'wave frames', wave.frames, 'cheer', cheer.frames)

if __name__ == '__main__':
    main()
