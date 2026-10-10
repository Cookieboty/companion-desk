#!/usr/bin/env node
// 开发环境预检：`pnpm doctor`（完整）或 `pnpm dev` 前自动跑的快速版（--quick）。
// 只用 Node 内建模块，Node 版本过低时也能给出清楚的提示。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const MIN_NODE = [22, 12, 0];
let failed = false;
const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const bad = (m, fix) => {
  failed = true;
  console.log(`  ✖ ${m}${fix ? `\n      → ${fix}` : ''}`);
};

console.log(quick ? 'Preflight' : 'Companion Desk doctor');

// 1. Node
const v = process.versions.node.split('.').map(Number);
const newer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
if (newer(v, MIN_NODE) < 0)
  bad(
    `Node ${process.versions.node} is too old (need >= ${MIN_NODE.join('.')}).`,
    'Install Node 22 LTS or newer (e.g. `nvm install` uses .nvmrc, or `brew install node@22`), then reinstall: rm -rf node_modules && pnpm install',
  );
else ok(`Node ${process.versions.node} (${process.platform}/${process.arch})`);

// 2. pnpm
const ua = process.env.npm_config_user_agent ?? '';
const pnpmV = /pnpm\/(\d+)/.exec(ua)?.[1];
if (ua && !pnpmV)
  bad(`run through pnpm, not ${ua.split(' ')[0]}`, 'corepack enable && pnpm install');
else if (pnpmV && Number(pnpmV) < 9)
  bad(
    `pnpm ${pnpmV} is too old (need >= 9)`,
    'corepack enable && corepack prepare pnpm@9 --activate',
  );
else if (pnpmV) ok(`pnpm ${/pnpm\/([\d.]+)/.exec(ua)?.[1]}`);

// 3. 依赖
const require = createRequire(path.join(root, 'package.json'));
if (!existsSync(path.join(root, 'node_modules'))) {
  bad('dependencies are not installed', 'pnpm install');
} else {
  ok('node_modules present');
  // 4. Electron 二进制（Electron 44 起不再在 postinstall 下载，首次运行时才下载）
  try {
    const pkgDir = path.dirname(require.resolve('electron/package.json'));
    const ver = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
    const pathTxt = path.join(pkgDir, 'path.txt');
    const has =
      existsSync(pathTxt) && existsSync(path.join(pkgDir, 'dist', readFileSync(pathTxt, 'utf8')));
    if (has) ok(`Electron ${ver} binary`);
    else {
      console.log(`  … downloading Electron ${ver} binary for ${process.platform}/${process.arch}`);
      const r = spawnSync(process.execPath, [path.join(pkgDir, 'install.js')], {
        stdio: 'inherit',
      });
      if (r.status === 0) ok(`Electron ${ver} binary downloaded`);
      else
        bad(
          'Electron binary download failed',
          'check network / proxy (ELECTRON_MIRROR, HTTPS_PROXY), then: rm -rf node_modules/electron && pnpm install',
        );
    }
  } catch {
    bad('electron package not found', 'pnpm install');
  }
}

// 5. 端口
const free = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
for (const [port, what] of [
  [3000, 'mascot renderer dev server'],
  [5175, 'chat window dev server'],
]) {
  if (await free(port)) ok(`port ${port} free (${what})`);
  else bad(`port ${port} is in use (${what})`, `stop the other process: lsof -i :${port}`);
}

// 6. 可选：AI provider 环境变量（只提示）
if (!quick) {
  const keys = [
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ];
  const set = keys.filter((k) => process.env[k]);
  if (set.length) ok(`provider keys in env: ${set.join(', ')}`);
  else
    warn(
      'no provider API key in env — add one later in the app (托盘 → AI 服务商) or export e.g. DEEPSEEK_API_KEY',
    );
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
    warn('no DISPLAY — run under a desktop session or xvfb-run');
}

if (failed) {
  console.log('\nPreflight failed — fix the items above and run again.');
  process.exit(1);
}
console.log(quick ? '' : '\nAll good. Start with: pnpm dev');
