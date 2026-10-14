/**
 * 探测本机 Claude Code / Codex / Cursor 可执行文件与版本。
 * 可通过环境变量覆盖路径（测试 / Mock）：
 *   NOMI_CLAUDE_BIN · NOMI_CODEX_BIN · NOMI_DSH_BIN · NOMI_CURSOR_BIN
 */
import { execFileSync, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { CliKind, UpdatableCli } from './types';

const ENV_BIN: Record<CliKind, string> = {
  claude: 'NOMI_CLAUDE_BIN',
  codex: 'NOMI_CODEX_BIN',
  dsh: 'NOMI_DSH_BIN',
  cursor: 'NOMI_CURSOR_BIN',
};

const CANDIDATES: Record<CliKind, string[]> = {
  claude: ['claude'],
  codex: ['codex'],
  dsh: ['dsh'],
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
    // 保留预发布段（dsh 当前发布 0.2.0-rc.x）
    const m = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(out);
    return m ? m[1]! : out.trim().slice(0, 64) || null;
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

export const NPM_PKG: Record<UpdatableCli, string> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  dsh: '@deepseek-ai/dsh',
};

/** dsh 依赖 Node ≥ 24（import.meta.main）；更低版本下静默无输出 */
export const DSH_MIN_NODE_MAJOR = 24;

/** PATH 上 node 的版本（dsh 的 shebang 为 `/usr/bin/env node`） */
export function readPathNodeVersion(): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'node.exe' : 'node', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    const m = /v?(\d+\.\d+\.\d+)/.exec(out);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

/**
 * dsh 运行时检查：返回 null 表示正常；否则返回检测到的 node 版本（或 'missing'）。
 */
export function dshRuntimeProblem(
  nodeVersion: string | null = readPathNodeVersion(),
): { nodeVersion: string | null; required: number } | null {
  const major = nodeVersion ? Number(nodeVersion.split('.')[0]) : NaN;
  if (Number.isFinite(major) && major >= DSH_MIN_NODE_MAJOR) return null;
  return { nodeVersion, required: DSH_MIN_NODE_MAJOR };
}
