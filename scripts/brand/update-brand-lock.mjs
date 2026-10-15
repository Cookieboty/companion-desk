#!/usr/bin/env node
/**
 * Brand lock for the Nomi 2D rig.
 *
 * Writes `brand-lock.json` next to the model manifest: the sha256 of every master layer PNG that
 * carries brand identity (hair, hairclips, ribbon, earring, jacket, chest logo, ID tag, face
 * plates …) and of the hand pieces. The unit test `tests/mascot/brandLock.test.ts` fails when any
 * of these files changes, so brand art can only change on purpose:
 *
 *   node scripts/brand/update-brand-lock.mjs          # after an approved brand-art change
 *   node scripts/brand/update-brand-lock.mjs --check  # verify only (exit 1 on mismatch)
 *
 * Never regenerate brand art with an image generator: see docs/BRAND.md ("品牌锁").
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const modelDir = join(root, 'packages/renderer/public/assets/models/sprite/nomi');
const lockPath = join(modelDir, 'brand-lock.json');

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function collect() {
  const files = {};
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.png')) files[relative(modelDir, p).split('\\').join('/')] = sha(p);
    }
  };
  walk(join(modelDir, 'layers'));
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** placement of the layers (offsets / scale / anchors / pivots) is part of the brand too */
function layoutHash() {
  const rig = JSON.parse(readFileSync(join(modelDir, 'manifest.json'), 'utf8')).rig;
  const canon = JSON.stringify({ layers: rig.layers, anchors: rig.anchors, pivots: rig.pivots });
  return createHash('sha256').update(canon).digest('hex');
}

const files = collect();
const lock = {
  note: 'sha256 of the locked Nomi master layers. Update only with an approved brand-art change (docs/BRAND.md).',
  algorithm: 'sha256',
  layout: layoutHash(),
  files,
};
const json = `${JSON.stringify(lock, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let cur = '';
  try {
    cur = readFileSync(lockPath, 'utf8');
  } catch {
    /* missing */
  }
  if (cur !== json) {
    console.error('brand-lock.json is out of date: brand layers changed.');
    process.exit(1);
  }
  console.log(`brand lock ok (${Object.keys(files).length} files)`);
} else {
  writeFileSync(lockPath, json);
  console.log(`wrote ${relative(root, lockPath)} (${Object.keys(files).length} files)`);
}
