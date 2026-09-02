#!/usr/bin/env tsx
/**
 * migrate-history
 *
 * 将旧的扁平 `chat_history.json`（ChatMessage[]）按 sessionId 拆分为
 * `<userData>/ai-chat/sessions/<sessionId>.jsonl`，与 FileSessionStore 的落盘
 * 结构完全对齐。
 *
 * 用法：
 *   pnpm exec tsx scripts/migrate-history.ts [--input <path>] [--sessions-dir <path>] [--dry-run] [--fallback-session <id>]
 *
 *   --input           旧 chat_history.json（默认 <userData>/chat_history.json）
 *   --sessions-dir    目标 sessions 目录（默认 <userData>/ai-chat/sessions）
 *   --fallback-session   未携带 sessionId 的旧消息合并到该会话（默认 "legacy"）
 *   --dry-run         仅打印摘要，不写盘
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { migrateLegacyHistory, serializeSessionFile } from './lib/migrate/history';

const BIN = 'migrate-history';

interface Cli {
  input: string;
  sessionsDir: string;
  dryRun: boolean;
  fallback: string;
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
  let sessionsDir = '';
  let dryRun = false;
  let fallback = 'legacy';
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--input') input = args[++i] ?? '';
    else if (a === '--sessions-dir') sessionsDir = args[++i] ?? '';
    else if (a === '--fallback-session') fallback = args[++i] ?? 'legacy';
    else if (a === '-h' || a === '--help') usage();
    else throw new Error(`unknown arg: ${a}`);
  }
  const userData = defaultUserData();
  return {
    input: input || path.join(userData, 'chat_history.json'),
    sessionsDir: sessionsDir || path.join(userData, 'ai-chat', 'sessions'),
    dryRun,
    fallback,
  };
}

function usage(): never {
  process.stderr.write(
    `usage: pnpm exec tsx scripts/migrate-history.ts [--input <path>] [--sessions-dir <path>] [--dry-run] [--fallback-session <id>]\n`,
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv);
  process.stdout.write(`[${BIN}] input=${cli.input}\n`);
  process.stdout.write(`[${BIN}] sessionsDir=${cli.sessionsDir}\n`);
  process.stdout.write(`[${BIN}] dryRun=${cli.dryRun}\n`);

  if (!existsSync(cli.input)) {
    process.stderr.write(`[${BIN}] input file not found: ${cli.input}\n`);
    process.exit(1);
  }

  const raw = await readFile(cli.input, 'utf8');
  let messages: unknown[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('root value is not an array');
    messages = parsed;
  } catch (err) {
    process.stderr.write(`[${BIN}] failed to parse json: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const result = migrateLegacyHistory(messages, { fallbackSessionId: cli.fallback });
  const totalRecords = result.sessions.reduce((acc, s) => acc + s.records.length, 0);
  process.stdout.write(
    `[${BIN}] sessions=${result.sessions.length} records=${totalRecords} skipped=${result.skipped.length}\n`,
  );
  for (const s of result.skipped) {
    process.stdout.write(`  - skipped ${s.id}: ${s.reason}\n`);
  }

  if (cli.dryRun) {
    for (const s of result.sessions) {
      process.stdout.write(
        `  · ${s.sessionId} records=${s.records.length} range=[${s.createdAt}..${s.updatedAt}]\n`,
      );
    }
    return;
  }

  await mkdir(cli.sessionsDir, { recursive: true });
  for (const s of result.sessions) {
    const dest = path.join(cli.sessionsDir, s.file);
    await writeFile(dest, serializeSessionFile(s), 'utf8');
    process.stdout.write(`[${BIN}] wrote ${dest}\n`);
  }
}

try {
  await main();
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[${BIN}] FATAL: ${message}\n`);
  process.exit(1);
}
