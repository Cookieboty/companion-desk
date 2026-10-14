/**
 * 探测本机 Claude Code / Codex / Cursor 可执行文件与版本。
 * 可通过环境变量覆盖路径（测试 / Mock）：
 *   NOMI_CLAUDE_BIN · NOMI_CODEX_BIN · NOMI_CURSOR_BIN
 */
import { execFileSync, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { CliKind } from './types';

const ENV_BIN: Record<CliKind, string> = {
  claude: 'NOMI_CLAUDE_BIN',
  codex: 'NOMI_CODEX_BIN',
  cursor: 'NOMI_CURSOR_BIN',
};

const CANDIDATES: Record<CliKind, string[]> = {
  claude: ['claude'],
  codex: ['codex'],
  cursor: ['cursor-agent', 'agent'],
};

function which(cmd: string): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return out && fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

export function resolveCliBin(kind: CliKind): string | null {
  const env = process.env[ENV_BIN[kind]]?.trim();
  if (env && fs.existsSync(env)) return env;
  for (const c of CANDIDATES[kind]) {
    const p = which(c);
    if (p) return p;
  }
  // 常见用户级 npm 前缀
  const home = os.homedir();
  for (const c of CANDIDATES[kind]) {
    for (const root of [
      path.join(home, '.local', 'bin', c),
      path.join(home, '.local', 'npm-global', 'bin', c),
    ]) {
      if (fs.existsSync(root)) return root;
    }
  }
  return null;
}

export function readVersion(bin: string): string | null {
  try {
    const out = execFileSync(bin, ['--version'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });
    const m = /(\d+\.\d+\.\d+)/.exec(out);
    return m ? m[1] : out.trim().slice(0, 64) || null;
  } catch {
    return null;
  }
}

export function guessInstallMethod(bin: string | null): 'npm' | 'native' | 'unknown' {
  if (!bin) return 'unknown';
  const n = bin.replace(/\\/g, '/').toLowerCase();
  if (n.includes('node_modules') || n.includes('npm-global')) return 'npm';
  if (n.includes('/.local/share/claude') || n.includes('/versions/')) return 'native';
  return 'unknown';
}

/** 异步拉 npm latest（失败返回 null） */
export function fetchNpmLatest(pkg: string, timeoutMs = 12_000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['view', pkg, 'version', '--json'],
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const v = JSON.parse(String(stdout).trim()) as unknown;
          resolve(typeof v === 'string' ? v : null);
        } catch {
          const m = /(\d+\.\d+\.\d+)/.exec(String(stdout));
          resolve(m ? m[1] : null);
        }
      },
    );
  });
}

export const NPM_PKG: Record<'claude' | 'codex', string> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
};
