#!/usr/bin/env node
/**
 * Writes `parts.json` next to manifest.json: the SHARED part list of the Nomi 2D rig.
 *
 * One standalone PNG per part (never merged, never redrawn) + explicit joint / pivot coordinates, so the
 * very same layer set can be consumed by the canvas rig (layeredRig.ts) AND by a Rive scene
 * (scripts/rive-eval/build-nomi-rive.py reads this file for the spine / hair-chain joints).
 *
 *   node scripts/brand/build-nomi-parts-manifest.mjs          # write
 *   node scripts/brand/build-nomi-parts-manifest.mjs --check  # verify it is up to date (CI / tests)
 *
 * Everything is derived from manifest.json (offsets, anchors, pivots, arm geometry) and the PNG sizes, so there
 * is a single source of truth for placement; this file only adds the skeleton (parent / z / joints / chains).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../packages/renderer/public/assets/models/sprite/nomi',
);
const manifest = JSON.parse(fs.readFileSync(path.join(MODEL, 'manifest.json'), 'utf8'));
const rig = manifest.rig;
const [W, H] = rig.size;
const png = (rel) => {
  const b = fs.readFileSync(path.join(MODEL, rel));
  return {
    w: b.readUInt32BE(16),
    h: b.readUInt32BE(20),
    sha256: createHash('sha256').update(b).digest('hex'),
  };
};

/** back → front draw order inside each group (matches drawRig) */
const PARTS = [
  // id, parent, group, brand, note
  [
    'body',
    'hips',
    'torso',
    true,
    'jacket + tank + belt + chest N logo + choker charm (whole torso, arms baked in)',
  ],
  [
    'body-noarm',
    'hips',
    'torso',
    true,
    'same torso art with both sleeves cut out; used while an arm is posed',
  ],
  ['badge', 'chest', 'torso', true, 'ID badge, swings from its lanyard pivot'],
  ['strap-r', 'chest', 'torso', true, 'right shoulder strap (fades while the right arm is posed)'],
  ['arm-l', 'chest', 'arm', true, 'sleeve; meshed into upper arm / forearm by the arm rig'],
  ['arm-r', 'chest', 'arm', true, 'sleeve; meshed into upper arm / forearm by the arm rig'],
  ['hair-tail-l', 'head', 'hair', true, 'collar hair lock (HD cut, behind the head); 3-bone chain'],
  ['hair-tail-r', 'head', 'hair', true, 'collar hair lock (HD cut, behind the head); 3-bone chain'],
  [
    'head',
    'head',
    'head',
    true,
    'face plate + back hair (bangs / crown regions punched, covered by the two layers)',
  ],
  ['crown', 'head', 'head', true, 'top hair'],
  ['eye-white-l', 'head', 'face', true, ''],
  ['eye-white-r', 'head', 'face', true, ''],
  ['iris-l', 'head', 'face', true, 'slides inside the eye white (gaze)'],
  ['iris-r', 'head', 'face', true, 'slides inside the eye white (gaze)'],
  ['lash-l', 'head', 'face', true, 'upper lash line'],
  ['lash-r', 'head', 'face', true, 'upper lash line'],
  ['mouth', 'head', 'face', true, 'mouth set (swap, never squash)'],
  ['mouth-open', 'head', 'face', true, ''],
  ['mouth-o', 'head', 'face', true, ''],
  ['mouth-frown', 'head', 'face', true, ''],
  ['bangs', 'head', 'head', true, 'fringe, in front of the face'],
  ['clip', 'head', 'head', true, 'N hairclip'],
  ['ribbon', 'head', 'head', true, 'orange bow of the clip; flutters about its knot'],
  ['earring', 'head', 'head', true, ''],
];

const parts = PARTS.map(([id, parent, group, brand, note], z) => {
  const o = rig.layers[id];
  if (!o) throw new Error(`manifest.json has no layer ${id}`);
  const file = `layers/${id}.png`;
  const { w, h, sha256 } = png(file);
  const k = o[2] ?? 1;
  const piv = rig.pivots?.[id];
  return {
    id,
    file,
    size: [w, h],
    /** top-left of the PNG in rig px */
    offset: [o[0], o[1]],
    /** px → rig px scale of the PNG (head art is stored at 1/0.66) */
    scale: k,
    rect: [o[0], o[1], +(o[0] + w * k).toFixed(2), +(o[1] + h * k).toFixed(2)],
    pivot: piv ?? null,
    parent,
    group,
    z,
    brand,
    sha256,
    ...(note ? { note } : {}),
  };
});

const hands = Object.entries(rig.hands ?? {}).map(([id, h]) => ({
  id: `hand-${id}`,
  file: `layers/hands/${h.file.replace(/^hands\//, '')}`,
  parent: 'wrist',
  group: 'hand',
  anchor: [h.ax, h.ay],
  size: [h.w, h.h],
  brand: false,
  note: 'hand shape swapped onto the wrist (non-brand)',
}));
for (const h of hands) h.sha256 = png(h.file).sha256;

const A = rig.anchors;
const BELT = +(H * 0.94).toFixed(1);
const CHEST = +(H * 0.46).toFixed(1);
const SPINE_BONES = 5;
const joints = {
  hips: [W / 2, H],
  neck: A.neck,
  shoulderL: rig.pivots['arm-l'],
  shoulderR: rig.pivots['arm-r'],
  tailRootL: A.tailL,
  tailRootR: A.tailR,
  ribbonKnot: A.ribbon,
  badge: rig.pivots.badge,
  strap: rig.pivots['strap-r'],
};
/** waist bend: fixed below the belt line, fully leaning from the chest up; angle follows smoothstep along y */
const spine = {
  belt: BELT,
  chest: CHEST,
  bones: SPINE_BONES,
  /** bone i spans y from belt - i*len to belt - (i+1)*len; its orientation target is spine * smoothstep((i + 0.5) / bones) */
  boneLength: +((BELT - CHEST) / SPINE_BONES).toFixed(2),
  x: W / 2,
  maxDeg: 14,
};
/** hanging locks: chain along the part's long axis from the root anchor to the tip; bone weights blend by y */
const chains = {};
for (const side of ['l', 'r']) {
  const p = parts.find((q) => q.id === `hair-tail-${side}`);
  const root = side === 'l' ? A.tailL : A.tailR;
  const [, y0, , y1] = p.rect;
  const bones = 3;
  const len = (y1 - root[1]) / bones;
  chains[`hair-tail-${side}`] = {
    part: p.id,
    root,
    bones,
    boneLength: +len.toFixed(2),
    /** straight down in rig space */
    dir: [0, 1],
    partTop: y0,
    tip: [root[0], y1],
  };
}
const out = {
  version: 1,
  generatedBy: 'scripts/brand/build-nomi-parts-manifest.mjs',
  rigSize: [W, H],
  note: 'Standalone parts + joints shared by the canvas rig and the Rive builder. Placement comes from manifest.json.',
  parts,
  hands,
  joints,
  spine,
  chains,
  arms: rig.arms,
  eyes: rig.eyes,
};
const text = `${JSON.stringify(out, null, 2)}\n`;
const dest = path.join(MODEL, 'parts.json');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== text) {
    console.error(
      'parts.json is out of date — run node scripts/brand/build-nomi-parts-manifest.mjs',
    );
    process.exit(1);
  }
  console.info(`parts ok (${parts.length} parts, ${hands.length} hands)`);
} else {
  fs.writeFileSync(dest, text);
  console.info(
    `wrote ${path.relative(process.cwd(), dest)} (${parts.length} parts, ${hands.length} hands)`,
  );
}
