import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 复制 CSS 与 AudioWorklet 模块（worklet 必须是独立文件，CSP 不允许 blob:/data: 脚本）
// fileURLToPath：Windows 上 URL.pathname 会得到 /D:/... 这种非法路径
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(src))
  if (f.endsWith('.css') || f.endsWith('-worklet.js')) copyFileSync(join(src, f), join(out, f));
