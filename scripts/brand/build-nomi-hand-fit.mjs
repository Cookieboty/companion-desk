#!/usr/bin/env node
// Writes the per-hand fit data (chirality, palm-normalising scale k, hand centre) into
// manifest.json rig.hands. The same table lives in packages/renderer/src/mascot/rig/armReach.ts
// (HAND_FIT); tests/mascot/partsManifest.test.ts asserts the two are equal.
//   node scripts/brand/build-nomi-hand-fit.mjs [--check]
// side = the character's own hand the artwork depicts (L / R) or S (symmetric); decided by eye per
// piece: palm view + thumb on the viewer's left = left hand, thumb on the right = right hand;
// back-of-hand view is the opposite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'packages/renderer/public/assets/models/sprite/nomi/manifest.json');
const FIT = {
  wave: { side: 'L', k: 1, cx: 153, cy: 184 },
  fist: { side: 'R', k: 0.92, cx: 123, cy: 79 },
  thumbsup: { side: 'R', k: 1, cx: 121, cy: 89 },
  point: { side: 'R', k: 1, cx: 91, cy: 164 },
  rest: { side: 'R', k: 0.95, cx: 142, cy: 122 },
  peace: { side: 'L', k: 1, cx: 114, cy: 134 },
  prayer: { side: 'S', k: 1.15, cx: 101, cy: 114 },
  ok: { side: 'L', k: 0.92, cx: 167, cy: 217 },
  chest: { side: 'R', k: 0.95, cx: 135, cy: 178 },
};
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
let dirty = false;
for (const [n, f] of Object.entries(FIT)) {
  const h = m.rig.hands[n];
  for (const [k, v] of Object.entries(f)) {
    if (h[k] !== v) {
      h[k] = v;
      dirty = true;
    }
  }
}
if (process.argv.includes('--check')) {
  if (dirty) {
    console.error(
      'manifest.json hand fit is stale: run node scripts/brand/build-nomi-hand-fit.mjs',
    );
    process.exit(1);
  }
  console.info('hand fit ok');
} else {
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
  console.info(dirty ? 'manifest.json updated' : 'manifest.json already up to date');
}
