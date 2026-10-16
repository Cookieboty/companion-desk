/**
 * 官方 CLI 的配置目录：尊重 CLAUDE_CONFIG_DIR / CODEX_HOME（支持 `~` 与 `~/…`），否则用默认目录。
 * 只算路径，不读任何文件。
 */
import os from 'node:os';
import path from 'node:path';

function expand(value: string | undefined, home: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v === '~') return home;
  if (v.startsWith('~/') || v.startsWith('~\\')) return path.join(home, v.slice(2));
  return path.resolve(v);
}

export function claudeConfigDir(home: string = os.homedir(), env: NodeJS.ProcessEnv = process.env) {
  return expand(env.CLAUDE_CONFIG_DIR, home) ?? path.join(home, '.claude');
}

export function codexHomeDir(home: string = os.homedir(), env: NodeJS.ProcessEnv = process.env) {
  return expand(env.CODEX_HOME, home) ?? path.join(home, '.codex');
}
