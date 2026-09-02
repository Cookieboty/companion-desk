#!/usr/bin/env tsx
/**
 * migrate-user-profile
 *
 * 将旧 AppConfig.chat（+ 可能的 ttsVoiceId）转换为初始 UserProfile 快照，写入
 * `<userData>/ai-chat/memory/user_profile.json`，与 FileProfileStorage 一致。
 *
 * 用法：
 *   pnpm exec tsx scripts/migrate-user-profile.ts [--input <path>] [--out <path>] [--dry-run] [--overwrite]
 *
 *   --input       旧 config.json（默认 <userData>/config.json）
 *   --out         目标 user_profile.json（默认 <userData>/ai-chat/memory/user_profile.json）
 *   --dry-run     仅打印结果，不写盘
 *   --overwrite   目标文件存在时覆盖（默认拒绝覆盖）
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { LegacyAppConfig } from './lib/migrate/types';
import { migrateLegacyUserProfile, type UserProfile } from './lib/migrate/userProfile';

const BIN = 'migrate-user-profile';

interface Cli {
  input: string;
  out: string;
  dryRun: boolean;
  overwrite: boolean;
}

function defaultUserData(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', 'ai-live2d-client');
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA ?? home, 'ai-live2d-client');
  return path.join(home, '.config', 'ai-live2d-client');
}

function parseCli(argv: string[]): Cli {
  const args = argv.slice(2);
  let input = '';
  let out = '';
  let dryRun = false;
  let overwrite = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--overwrite') overwrite = true;
    else if (a === '--input') input = args[++i] ?? '';
    else if (a === '--out') out = args[++i] ?? '';
    else if (a === '-h' || a === '--help') usage();
    else throw new Error(`unknown arg: ${a}`);
  }
  const userData = defaultUserData();
  return {
    input: input || path.join(userData, 'config.json'),
    out: out || path.join(userData, 'ai-chat', 'memory', 'user_profile.json'),
    dryRun,
    overwrite,
  };
}

function usage(): never {
  process.stderr.write(
    `usage: pnpm exec tsx scripts/migrate-user-profile.ts [--input <path>] [--out <path>] [--dry-run] [--overwrite]\n`,
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv);
  process.stdout.write(`[${BIN}] input=${cli.input}\n`);
  process.stdout.write(`[${BIN}] out=${cli.out}\n`);
  process.stdout.write(`[${BIN}] dryRun=${cli.dryRun} overwrite=${cli.overwrite}\n`);

  if (!existsSync(cli.input)) {
    process.stderr.write(`[${BIN}] input file not found: ${cli.input}\n`);
    process.exit(1);
  }

  const raw = await readFile(cli.input, 'utf8');
  let config: LegacyAppConfig;
  try {
    config = JSON.parse(raw) as LegacyAppConfig;
  } catch (err) {
    process.stderr.write(`[${BIN}] failed to parse json: ${(err as Error).message}\n`);
    process.exit(1);
  }

  let base: UserProfile | undefined;
  if (existsSync(cli.out)) {
    try {
      const existing = JSON.parse(await readFile(cli.out, 'utf8')) as UserProfile;
      base = existing;
    } catch (err) {
      process.stderr.write(
        `[${BIN}] existing ${cli.out} is not valid json, will treat as fresh: ${(err as Error).message}\n`,
      );
    }
  }

  const profile = migrateLegacyUserProfile(config, { base });

  if (cli.dryRun) {
    process.stdout.write(`[${BIN}] dry-run: not writing.\n`);
    process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
    return;
  }

  if (existsSync(cli.out) && !cli.overwrite) {
    process.stderr.write(
      `[${BIN}] refuse to overwrite ${cli.out}; rerun with --overwrite to force\n`,
    );
    process.exit(1);
  }

  await mkdir(path.dirname(cli.out), { recursive: true });
  const tmp = `${cli.out}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(profile, null, 2), 'utf8');
  await rename(tmp, cli.out);
  process.stdout.write(`[${BIN}] wrote ${cli.out}\n`);
}

try {
  await main();
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[${BIN}] FATAL: ${message}\n`);
  process.exit(1);
}
