import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = new URL('../src/', import.meta.url).pathname;
const out = new URL('../dist/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
for (const f of readdirSync(src)) if (f.endsWith('.css')) copyFileSync(join(src, f), join(out, f));
