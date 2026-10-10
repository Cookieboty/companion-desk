#!/usr/bin/env tsx
/**
 * dsh 基座诊断脚本
 *
 * 用途：验证当前仓库锁定的 @deepseek-ai/dsh 能否把项目内 profiles/<name>/ 装配成
 * 一颗非空的 entry tree，并同时给出节点级健康检查（Node 版本、平台等）。
 *
 * 用法：
 *   pnpm doctor waifu
 *   pnpm doctor chat-only
 *   pnpm doctor mcp-headless
 *   pnpm doctor waifu --report=doctor-report.json
 *
 * 输出：
 *   - 节点级检查（Node/OS）
 *   - profile 元数据（name / dir / patchReload / bundles / patchPath）
 *   - 每一层 bundle 的 patch 行数
 *   - composed entry 总数 & skipped-patch 警告（若有）
 *   - --report=<path> 时写入完整 JSON 报告（含 checks/profile/node）
 *
 * 退出码：
 *   0 -> 全绿（status=ok）
 *   1 -> 存在 warn 或 fail（含缺 bundle / 空 entry / skipped-patch）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stringify as yamlStringify } from 'yaml';

import { runDoctor, type DoctorReport } from './lib/doctor/index';

const BIN_NAME = 'dsh-doctor';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

function usage(): never {
  process.stderr.write(
    `usage: pnpm doctor <profile> [--report=<path>]\n` +
      `available profiles: waifu, chat-only, mcp-headless\n`,
  );
  process.exit(2);
}

interface CliOptions {
  profileName: string;
  reportPath?: string;
}

function parseArgs(argv: string[]): CliOptions | null {
  let profileName: string | undefined;
  let reportPath: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith('--report=')) {
      const val = arg.slice('--report='.length);
      if (!val) return null;
      reportPath = val;
      continue;
    }
    if (arg.startsWith('-')) return null;
    if (profileName) return null;
    profileName = arg;
  }
  if (!profileName) return null;
  return { profileName, ...(reportPath ? { reportPath } : {}) };
}

function printReport(report: DoctorReport): void {
  process.stdout.write(`[${BIN_NAME}] profile=${report.profileName}\n`);
  process.stdout.write(`[${BIN_NAME}] home=${report.projectRoot}\n`);
  process.stdout.write(
    `[${BIN_NAME}] node=${report.node.version} platform=${report.node.platform}/${report.node.arch}` +
      (report.node.engineRequirement ? ` engines.node=${report.node.engineRequirement}` : '') +
      `\n`,
  );

  process.stdout.write(`\n[${BIN_NAME}] === checks ===\n`);
  for (const c of report.checks) {
    const badge = c.status === 'ok' ? 'OK  ' : c.status === 'warn' ? 'WARN' : 'FAIL';
    process.stdout.write(`  [${badge}] ${c.label}: ${c.message}\n`);
  }

  if (report.profile) {
    const p = report.profile;
    process.stdout.write(
      `\n[${BIN_NAME}] === profile meta ===\n` +
        `name         : ${p.name}\n` +
        `dir          : ${p.dir}\n` +
        `patchReload  : ${p.patchReload}\n` +
        `patchPath    : ${p.patchPath}\n` +
        `userPatches  : ${p.userPatches}\n`,
    );
    process.stdout.write(`\n[${BIN_NAME}] === bundle layers ===\n`);
    for (const layer of p.layers) {
      process.stdout.write(
        `- ${layer.packageName}\n` +
          `    dir     : ${layer.packageDir}\n` +
          `    patch   : ${layer.patchPath}\n` +
          `    entries : ${layer.entries}\n`,
      );
    }
    // 保留 P8-8 e2e 断言依赖的 stdout 契约：
    //   `=== composed entries (N) ===` + `- id: X` YAML 段 + `ok: N entries composed, no warnings`
    process.stdout.write(`\n[${BIN_NAME}] === composed entries (${p.entries}) ===\n`);
    process.stdout.write(yamlStringify(p.entryList));
    if (p.warnings.length > 0) {
      process.stderr.write(
        `\n[${BIN_NAME}] === skipped-patch warnings (${p.warnings.length}) ===\n`,
      );
      for (const w of p.warnings) process.stderr.write(`  - ${w}\n`);
    }
  }
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
  if (!cli) usage();

  const report = runDoctor({
    bin: BIN_NAME,
    projectRoot,
    profileName: cli.profileName,
  });

  printReport(report);

  if (cli.reportPath) {
    const abs = path.isAbsolute(cli.reportPath)
      ? cli.reportPath
      : path.resolve(projectRoot, cli.reportPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(report, null, 2));
    process.stdout.write(`\n[${BIN_NAME}] report written: ${abs}\n`);
  }

  if (report.status === 'ok') {
    if (report.profile) {
      // 保留 P8-8 e2e 断言的 `ok: N entries composed, no warnings` 结尾。
      process.stdout.write(
        `\n[${BIN_NAME}] ok: ${report.profile.entries} entries composed, no warnings\n`,
      );
    } else {
      process.stdout.write(`\n[${BIN_NAME}] ok: all checks passed\n`);
    }
    return;
  }
  process.stderr.write(`\n[${BIN_NAME}] status=${report.status}: see checks above\n`);
  process.exitCode = 1;
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[${BIN_NAME}] FATAL: ${message}\n`);
  process.exit(1);
}
