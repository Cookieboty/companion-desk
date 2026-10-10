import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath：Windows 上 URL.pathname 会得到 /D:/... 这种非法路径
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(src)) if (f.endsWith('.css')) copyFileSync(join(src, f), join(out, f));
