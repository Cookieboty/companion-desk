#!/usr/bin/env python3
"""Wireframe-stage Rive scene for the sheet-based Nomi rig (no animation).
Artboard = front-view hip-up crop of nomi-layer-sheet.png (sheet x 0..345, y 116..725) at 2x.  Placeholders are real pixel crops of the
Real-ESRGAN-upscaled front view at each layer's bbox (so the stack re-composes the figure), outlined per group; a bone skeleton with correct
left/right (r = character's RIGHT = screen-LEFT, l = character's LEFT = screen-RIGHT) plus joint/bone markers.  Bboxes are approximate (+-8 sheet px)."""
import math, json
from pathlib import Path
import cv2
ROOT = Path(__file__).resolve().parents[2]
RIG = ROOT / 'rive/nomi-sheet-rig'; AS = RIG / 'assets'; (AS / 'layers').mkdir(parents=True, exist_ok=True)
OX, OY, S = 0, 116, 2.0                                   # sheet -> artboard
AW, AH = int(345 * S), int(609 * S)
def A(x, y): return ((x - OX) * S, (y - OY) * S)
src = cv2.imread(str(ROOT / 'rive/nomi-sheet/crops/layer-front-hipup@4x.jpg'))
ghost = cv2.resize(src, (AW, AH), interpolation=cv2.INTER_AREA); cv2.imwrite(str(AS / 'front-hipup-2x.png'), ghost)
# (name, bbox sheet px, group, source layer-sheet part / note)
LAYERS = [
 ('hair-front',      (75, 122, 205, 175), 'hair',  'parts/hair-front'),
 ('bangs',           (110, 150, 125, 85), 'hair',  'parts/bangs'),
 ('hair-side-r',     (68, 185, 65, 135),  'hair',  'parts/hair-side-r (screen-left)'),
 ('hair-side-l',     (228, 185, 58, 135), 'hair',  'parts/hair-side-l (screen-right)'),
 ('hairclip-n',      (203, 181, 32, 28),  'acc',   'parts/hair-acc-2'),
 ('hair-ribbon',     (236, 200, 50, 62),  'acc',   'parts/hair-acc-1'),
 ('hairpin-orange',  (110, 183, 26, 16),  'acc',   'sheet only (no separate part)'),
 ('brow-r',          (143, 205, 44, 16),  'face',  'parts/brow (mirror)'),
 ('brow-l',          (188, 205, 44, 16),  'face',  'parts/brow'),
 ('eye-r',           (143, 218, 46, 30),  'face',  'parts/eye-r'),
 ('eye-l',           (186, 218, 46, 30),  'face',  'parts/eye-l'),
 ('mouth',           (166, 258, 40, 20),  'face',  'parts/mouth + 10 expression tiles'),
 ('face',            (136, 170, 98, 125), 'face',  'parts/face'),
 ('choker',          (150, 282, 56, 28),  'acc',   'parts/choker'),
 ('star-pendant',    (168, 302, 14, 22),  'acc',   'parts/star-pendant'),
 ('neck',            (160, 280, 30, 32),  'body',  'MISSING on layer sheet: regenerate / cut from front view'),
 ('hood-collar',     (80, 290, 190, 45),  'jacket','parts/jacket-back (inner) + front view'),
 ('badge',           (128, 543, 32, 58),  'acc',   'parts/badge'),
 ('side-bag',        (222, 505, 48, 50),  'acc',   'parts/bag'),
 ('belt',            (95, 468, 158, 34),  'body',  'parts/belt-acc'),
 ('shorts',          (88, 495, 162, 170), 'body',  'parts/shorts'),
 ('thigh-r',         (110, 640, 60, 85),  'leg',   'parts/thigh-r (cropped by hip-up)'),
 ('thigh-l',         (178, 640, 62, 85),  'leg',   'parts/thigh-l (cropped by hip-up)'),
 ('hand-r',          (38, 646, 62, 58),   'arm',   'parts/hand-r'),
 ('hand-l',          (250, 646, 62, 58),  'arm',   'parts/hand-l'),
 ('cuff-r',          (30, 628, 68, 26),   'arm',   'inside parts/forearm-r'),
 ('cuff-l',          (252, 628, 68, 26),  'arm',   'inside parts/forearm-l'),
 ('sleeve-fore-r',   (15, 500, 85, 140),  'arm',   'parts/forearm-r'),
 ('sleeve-fore-l',   (250, 500, 85, 140), 'arm',   'parts/forearm-l'),
 ('sleeve-upper-r',  (15, 320, 90, 190),  'arm',   'parts/jacket-r (sleeve) - upper arm hidden inside, regenerate'),
 ('sleeve-upper-l',  (245, 320, 90, 190), 'arm',   'parts/jacket-l (sleeve) - upper arm hidden inside, regenerate'),
 ('jacket-body-r',   (70, 295, 70, 340),  'jacket','parts/jacket-r'),
 ('jacket-body-l',   (212, 295, 75, 340), 'jacket','parts/jacket-l'),
 ('torso-top',       (100, 300, 150, 190),'body',  'parts/torso'),
]
COL = dict(hair='FFB45AE6', acc='FFE6A01E', face='FF2CC8A0', body='FF3C8CF0', jacket='FFF05A5A', arm='FF28A0F0', leg='FF8C8CC8')
# skeleton: world points (sheet px). r = character's right = screen-LEFT.
CX = 175.0
def mir(p): return (2 * CX - p[0], p[1])
SK = dict(hip=(175, 600), spine=(175, 480), chest=(175, 380), neck=(175, 305), head=(175, 285), headTop=(175, 123))
SHL = (252, 350); ELL = (274, 498); WRL = (286, 641); TIPL = (286, 698)       # character's LEFT arm = screen-right
ids = iter(range(100, 10000)); nid = lambda: f'0:{next(ids)}'
out = []; assets = []
def bone(name, p0, p1, parent_world, depth, kids=''):
    """Bone from world p0 to p1; rotation is relative to the parent's world rotation"""
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0]); ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * S
    return ang, ln
def tag(n, **kw): return ' '.join(f'{k}="{v}"' for k, v in kw.items())
def chain(spec, parent_ang, indent, root=False):
    """spec = (name, p0, p1, [children]) -> xml"""
    name, p0, p1, kids = spec
    ang, ln = bone(name, p0, p1, parent_ang, 0)
    rel = ang - parent_ang if not root else ang
    pad = '    ' * indent
    if root:
        x, y = A(*p0); head = f'{pad}<RootBone name="{name}" x="{x:.2f}" y="{y:.2f}" rotation="{rel:.5f}" length="{ln:.2f}" id="{nid()}"'
    else:
        head = f'{pad}<Bone name="{name}" rotation="{rel:.5f}" length="{ln:.2f}" id="{nid()}"'
    inner = ''.join(chain(k, ang, indent + 1) for k in kids)
    return head + (f'>\n{inner}{pad}</{"RootBone" if root else "Bone"}>\n' if inner else '/>\n')
def arm(side):
    f = (lambda p: p) if side == 'l' else mir
    sh, el, wr, tip = f(SHL), f(ELL), f(WRL), f(TIPL)
    return [(f'upperarm-{side}', sh, el, [(f'forearm-{side}', el, wr, [(f'hand-{side}', wr, tip, [])])])]
sk = ('hip', SK['hip'], SK['spine'], [('spine', SK['spine'], SK['chest'], [('chest', SK['chest'], SK['neck'], [
        ('neck', SK['neck'], SK['head'], [('head', SK['head'], SK['headTop'], [])]),
        ('clavicle-l', SK['neck'], SHL, arm('l')),
        ('clavicle-r', SK['neck'], mir(SHL), arm('r'))])])])
bones_xml = chain(sk, 0, 3, root=True)
# markers: joints + bone lines (static overlay; bones themselves are not drawn by Rive)
pts = {n: p for n, p in SK.items()}
pts.update({'shoulder-l': SHL, 'elbow-l': ELL, 'wrist-l': WRL, 'tip-l': TIPL, 'shoulder-r': mir(SHL), 'elbow-r': mir(ELL), 'wrist-r': mir(WRL), 'tip-r': mir(TIPL)})
segs = [('hip', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'head'), ('head', 'headTop'), ('neck', 'shoulder-l'), ('neck', 'shoulder-r'),
        ('shoulder-l', 'elbow-l'), ('elbow-l', 'wrist-l'), ('wrist-l', 'tip-l'), ('shoulder-r', 'elbow-r'), ('elbow-r', 'wrist-r'), ('wrist-r', 'tip-r')]
mk = []
for a, b in segs:
    p0, p1 = pts[a], pts[b]; x, y = A(*p0); ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0]); ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * S
    mk.append(f'            <Shape name="bone {a}-{b}" x="{x:.1f}" y="{y:.1f}" rotation="{ang:.5f}" id="{nid()}"><Rectangle width="{ln:.1f}" height="3" originX="0" originY="0.5" name="p"/><Fill name="f"><SolidColor colorValue="FFFFFFFF"/></Fill><Stroke thickness="1"><SolidColor colorValue="FF000000"/></Stroke></Shape>')
for n, p in pts.items():
    x, y = A(*p); c = 'FFFF3030' if n.endswith('-r') else ('FF30C030' if n.endswith('-l') else 'FFFFD000')
    mk.append(f'            <Shape name="joint {n}" x="{x:.1f}" y="{y:.1f}" id="{nid()}"><Ellipse width="11" height="11" name="p"/><Fill name="f"><SolidColor colorValue="{c}"/></Fill><Stroke thickness="1.5"><SolidColor colorValue="FF000000"/></Stroke></Shape>')
# assets + layer nodes
assets_xml = [f'    <ImageAsset name="ghost" file="assets/front-hipup-2x.png" id="0:{nid().split(":")[1]}"/>']
layer_xml = []; crops_info = []
for name, (x, y, w, h), grp, srcn in LAYERS:
    ax, ay = A(x, y); aw, ah = w * S, h * S
    x0, y0 = int(round(ax)), int(round(ay)); x1, y1 = min(AW, int(round(ax + aw))), min(AH, int(round(ay + ah)))
    x0, y0 = max(x0, 0), max(y0, 0)
    if x1 <= x0 or y1 <= y0: continue
    p = AS / 'layers' / f'{name}.png'; cv2.imwrite(str(p), ghost[y0:y1, x0:x1])
    aid = nid(); assets_xml.append(f'    <ImageAsset name="{name}" file="assets/layers/{name}.png" id="{aid}"/>')
    layer_xml.append(f'''            <Node name="{name}" id="{nid()}">
                <Image name="crop" assetId="{aid}" x="{x0}" y="{y0}" originX="0" originY="0" id="{nid()}"/>
                <Shape name="outline" x="{(x0 + x1) / 2:.1f}" y="{(y0 + y1) / 2:.1f}" id="{nid()}"><Rectangle width="{x1 - x0}" height="{y1 - y0}" name="p"/><Stroke thickness="1.5"><SolidColor colorValue="{COL[grp]}"/></Stroke></Shape>
            </Node>''')
    crops_info.append(dict(layer=name, group=grp, sheet_bbox=[x, y, w, h], artboard_px=[x0, y0, x1 - x0, y1 - y0], source=srcn))
sm = nid(); ly = nid(); an = nid(); abid = nid()
xml = f'''<Rive version="1" kind="fragment">
{chr(10).join(assets_xml)}
    <Artboard defaultStateMachineId="{sm}" styleId="0:5" width="{AW}" height="{AH}" name="Nomi-sheet-rig" id="0:2">
        <LayoutComponentStyle name="Artboard Style" id="0:5"/>
        <Fill name="Background"><SolidColor colorValue="FFFFFFFF" name="Color"/></Fill>
        <Node name="markers (bones + joints; wireframe only)" id="{nid()}">
{chr(10).join(mk)}
        </Node>
        <Node name="rig" id="{nid()}">
{bones_xml}        </Node>
        <Node name="layers (front to back)" id="{nid()}">
{chr(10).join(layer_xml)}
        </Node>
        <StateMachine name="State Machine 1" id="{sm}">
            <StateMachineLayer name="Layer 1" id="{ly}">
                <AnyState x="200" y="-120"/>
                <ExitState x="400" y="-120"/>
                <EntryState><StateTransition stateToId="{abid}"/></EntryState>
                <AnimationState x="200" animationId="{an}" id="{abid}"/>
            </StateMachineLayer>
        </StateMachine>
        <LinearAnimation duration="60" name="rest (no animation yet)" id="{an}"/>
    </Artboard>
</Rive>
'''
(RIG / 'scene.rml').write_text(xml)
(RIG / 'layers.json').write_text(json.dumps(dict(artboard=[AW, AH], sheet_to_artboard=dict(offset=[OX, OY], scale=S), layers=crops_info,
    bones={k: list(v) for k, v in pts.items()}, mirror_axis_x=CX, note='r = character RIGHT = screen-LEFT; l = character LEFT = screen-RIGHT'), indent=1, ensure_ascii=False))
print('layers', len(crops_info), 'artboard', AW, AH)
