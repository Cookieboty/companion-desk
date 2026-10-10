// 把 src/patch.yml 复制到 dist/patch.yml，供 dsh 的 bundle 引用
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'src/patch.yml');
const dst = resolve(root, 'dist/patch.yml');

if (!existsSync(src)) {
  console.warn('[copy-patch] src/patch.yml 不存在，跳过');
  process.exit(0);
}
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst);
console.info('[copy-patch] ok: dist/patch.yml');
