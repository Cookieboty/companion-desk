#!/usr/bin/env tsx
/**
 * migrate-config
 *
 * 将旧 electron 端 `<userData>/config.json`（AIModelConfig[] + AppConfig）转换为
 * dsh profile 期望的 llm.providers[] 结构，并把 apiKey 拆分成 keyEntries，供
 * SafeKeyProvider 或人工写入 `<userData>/keys/<keyRef>.bin`。
 *
 * 用法：
 *   pnpm migrate:config [--input <path>] [--out <path>] [--dry-run]
 *
 *   --input     旧 config.json 路径（默认 <userData>/config.json）
 *   --out       生成的 provider patch JSON 输出路径
 *               （默认 <userData>/ai-chat/dsh/providers.migrated.json）
 *   --dry-run   仅打印摘要，不写文件；不备份原 config
 *
 * 会产出：
 *   - <out>                 provider patch + defaultProviderId + keyEntries
 *   - <input>.legacy.json   备份（保留旧文件），dry-run 模式跳过
 *
 * 注：apiKey 明文只写入内存中的 keyEntries；本脚本 **不会** 直接调用
 *     Electron `safeStorage`（脱离 app runtime 无法工作），需要在 electron
 *     进程内 import 该脚本或调用同名纯函数完成密钥落盘。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { migrateLegacyConfig } from './lib/migrate/config';
import type { LegacyAppConfig } from './lib/migrate/types';

const BIN = 'migrate-config';

interface Cli {
  input: string;
  out: string;
  dryRun: boolean;
}

function parseCli(argv: string[]): Cli {
  const args = argv.slice(2);
  let input = '';
  let out = '';
  let dryRun = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--input') input = args[++i] ?? '';
    else if (a === '--out') out = args[++i] ?? '';
    else if (a === '-h' || a === '--help') usage();
    else throw new Error(`unknown arg: ${a}`);
  }
  const userData = defaultUserData();
  return {
    input: input || path.join(userData, 'config.json'),
    out: out || path.join(userData, 'ai-chat', 'dsh', 'providers.migrated.json'),
    dryRun,
  };
}

function defaultUserData(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', 'ai-live2d-client');
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA ?? home, 'ai-live2d-client');
  return path.join(home, '.config', 'ai-live2d-client');
}

function usage(): never {
  process.stderr.write(
    `usage: pnpm exec tsx scripts/migrate-config.ts [--input <path>] [--out <path>] [--dry-run]\n`,
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv);
  process.stdout.write(`[${BIN}] input=${cli.input}\n`);
  process.stdout.write(`[${BIN}] out=${cli.out}\n`);
  process.stdout.write(`[${BIN}] dryRun=${cli.dryRun}\n`);

  if (!existsSync(cli.input)) {
    process.stderr.write(`[${BIN}] input file not found: ${cli.input}\n`);
    process.exit(1);
  }

  const raw = await readFile(cli.input, 'utf8');
  let parsed: LegacyAppConfig;
  try {
    parsed = JSON.parse(raw) as LegacyAppConfig;
  } catch (err) {
    process.stderr.write(`[${BIN}] failed to parse json: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const result = migrateLegacyConfig(parsed);
  process.stdout.write(
    `[${BIN}] providers=${result.providers.length} keys=${result.keyEntries.length} skipped=${result.skipped.length}\n`,
  );
  for (const s of result.skipped) {
    process.stdout.write(`  - skipped ${s.id}: ${s.reason}\n`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    defaultProviderId: result.defaultProviderId,
    providers: result.providers,
    keyEntries: result.keyEntries.map((k) => ({ keyRef: k.keyRef })),
    _secretPayload: result.keyEntries,
  };

  if (cli.dryRun) {
    process.stdout.write(`[${BIN}] dry-run: not writing.\n`);
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  await mkdir(path.dirname(cli.out), { recursive: true });
  await writeFile(cli.out, JSON.stringify(output, null, 2), 'utf8');
  process.stdout.write(`[${BIN}] wrote ${cli.out}\n`);

  const backup = cli.input.replace(/\.json$/, '.legacy.json');
  await rename(cli.input, backup);
  process.stdout.write(`[${BIN}] backed up ${cli.input} -> ${backup}\n`);
}

try {
  await main();
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[${BIN}] FATAL: ${message}\n`);
  process.exit(1);
}
