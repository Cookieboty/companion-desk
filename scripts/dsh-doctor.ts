#!/usr/bin/env tsx
/**
 * dsh 基座诊断脚本
 *
 * 用途：验证当前仓库锁定的 @deepseek-ai/dsh 能否把项目内 profiles/<name>/ 装配成
 * 一颗非空的 entry tree，且所有 bundle 补丁层能被正常合并。
 *
 * 用法：
 *   pnpm doctor waifu
 *   pnpm doctor chat-only
 *   pnpm doctor mcp-headless
 *
 * 输出：
 *   - profile 元数据（name / dir / patchReload / bundles / patchPath）
 *   - 每一层 bundle 的 patch 行数
 *   - composed entry list（YAML dump）
 *   - skipped-patch 警告（若有）
 *
 * 退出码：
 *   0 -> 装配成功
 *   1 -> 装配失败（缺 bundle、patch 引用不存在的 id、YAML 语法错等）
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot';
import { stringify as yamlStringify } from 'yaml';

const BIN_NAME = 'dsh-doctor';
const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

function usage(): never {
  process.stderr.write(
    `usage: pnpm doctor <profile>\n` + `available profiles: waifu, chat-only, mcp-headless\n`,
  );
  process.exit(2);
}

function main(): void {
  const profileName = process.argv[2];
  if (!profileName || profileName.startsWith('-')) usage();

  const installAnchor = require.resolve('@deepseek-ai/dsh/package.json');
  const home = projectRoot;

  process.stdout.write(`[${BIN_NAME}] profile=${profileName}\n`);
  process.stdout.write(`[${BIN_NAME}] home=${home}\n`);
  process.stdout.write(`[${BIN_NAME}] installAnchor=${installAnchor}\n`);

  const profile = loadProfile(BIN_NAME, profileName, installAnchor, home);

  process.stdout.write(
    `\n[${BIN_NAME}] === profile meta ===\n` +
      `name         : ${profile.name}\n` +
      `dir          : ${profile.dir}\n` +
      `patchReload  : ${profile.patchReload}\n` +
      `patchPath    : ${profile.patchPath}\n` +
      `userPatches  : ${profile.patches.length}\n`,
  );

  process.stdout.write(`\n[${BIN_NAME}] === bundle layers ===\n`);
  for (const layer of profile.layers) {
    process.stdout.write(
      `- ${layer.packageName}\n` +
        `    dir     : ${layer.packageDir}\n` +
        `    patch   : ${layer.patchPath}\n` +
        `    entries : ${layer.patches.length}\n`,
    );
  }

  const warnings: string[] = [];
  const entries = composeEntries(
    [...profile.layers.map((layer) => layer.patches), profile.patches],
    (message) => warnings.push(message),
  );

  process.stdout.write(`\n[${BIN_NAME}] === composed entries (${entries.length}) ===\n`);
  process.stdout.write(yamlStringify(entries));

  if (warnings.length > 0) {
    process.stderr.write(`\n[${BIN_NAME}] === skipped-patch warnings (${warnings.length}) ===\n`);
    for (const message of warnings) {
      process.stderr.write(`  - ${message}\n`);
    }
    process.exitCode = 1;
    return;
  }

  if (entries.length === 0) {
    process.stderr.write(`\n[${BIN_NAME}] composed entry list is empty; profile misconfigured\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\n[${BIN_NAME}] ok: ${entries.length} entries composed, no warnings\n`);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[${BIN_NAME}] FATAL: ${message}\n`);
  process.exit(1);
}
