#!/usr/bin/env node
/* eslint-disable no-console -- CI / release script */
/**
 * Ensure sherpa-onnx native platform packages are present for electron-builder.
 *
 * Why: `sherpa-onnx-node` lists them as optionalDependencies; `pnpm install` only
 * fetches the *current* OS/CPU. Mac DMG builds both x64 + arm64, so an arm64
 * runner still needs `sherpa-onnx-darwin-x64`. Never rely on Linux cross-install
 * for win/mac natives — build those installers on windows-latest / macos-latest.
 *
 * Usage:
 *   node scripts/release/ensure-sherpa-platform.mjs <linux|mac|win> [--check]
 *
 * --check  verify only (exit 1 if missing); default downloads missing tarballs
 *          into <repo>/node_modules/sherpa-onnx-<platform>-<arch>/
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const require = createRequire(path.join(REPO_ROOT, 'package.json'));

export const NEEDED = Object.freeze({
  linux: ['sherpa-onnx-linux-x64'],
  win: ['sherpa-onnx-win-x64'],
  // Dual-arch DMG (electron-builder.yml mac.target.arch: x64 + arm64)
  mac: ['sherpa-onnx-darwin-arm64', 'sherpa-onnx-darwin-x64'],
});

export function resolveSherpaVersion(requireFn = require) {
  try {
    const pkg = requireFn('sherpa-onnx-node/package.json');
    if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version;
  } catch {
    /* fall through */
  }
  return '1.13.8';
}

export async function hasSherpaPackage(name, root = REPO_ROOT) {
  const dir = path.join(root, 'node_modules', name);
  try {
    await fs.stat(path.join(dir, 'package.json'));
    const files = await fs.readdir(dir);
    return files.some(
      (f) => f.endsWith('.node') || f.endsWith('.dll') || f.endsWith('.so') || f.endsWith('.dylib'),
    );
  } catch {
    return false;
  }
}

async function downloadAndExtract(name, version, root = REPO_ROOT) {
  const url = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
  const dest = path.join(root, 'node_modules', name);
  console.log(`[sherpa-native] fetching ${name}@${version}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  const tmp = path.join(root, 'node_modules', `.${name}-${version}.tgz`);
  await pipeline(res.body, createWriteStream(tmp));
  try {
    execFileSync('tar', ['-xzf', tmp, '-C', dest, '--strip-components=1'], {
      stdio: 'inherit',
    });
  } finally {
    await fs.rm(tmp, { force: true });
  }
  if (!(await hasSherpaPackage(name, root))) {
    throw new Error(`${name} extracted but native binary missing under ${dest}`);
  }
  console.log(`[sherpa-native] ready ${name}`);
}

export async function ensureSherpaPlatform(
  platform,
  { checkOnly = false, root = REPO_ROOT, requireFn = require } = {},
) {
  const needed = NEEDED[platform];
  if (!needed) throw new Error(`unknown platform: ${platform} (linux|mac|win)`);
  const version = resolveSherpaVersion(requireFn);
  const missing = [];
  for (const name of needed) {
    if (await hasSherpaPackage(name, root)) {
      console.log(`[sherpa-native] ok ${name}`);
    } else {
      missing.push(name);
    }
  }
  if (missing.length === 0) return { version, needed, missing: [] };
  if (checkOnly) {
    throw new Error(
      `missing sherpa natives for ${platform}: ${missing.join(', ')} (need ${version})`,
    );
  }
  for (const name of missing) {
    await downloadAndExtract(name, version, root);
  }
  return { version, needed, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const platform = process.argv[2];
  const checkOnly = process.argv.includes('--check');
  if (!platform || platform.startsWith('-')) {
    console.error(
      'Usage: node scripts/release/ensure-sherpa-platform.mjs <linux|mac|win> [--check]',
    );
    process.exit(2);
  }
  ensureSherpaPlatform(platform, { checkOnly })
    .then((r) => {
      console.log(
        `[sherpa-native] ${platform}: version=${r.version} packages=${r.needed.join(',')}`,
      );
    })
    .catch((e) => {
      console.error(`[sherpa-native] ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    });
}
