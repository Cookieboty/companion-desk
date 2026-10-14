/**
 * CLI 版本检测与白名单更新（Claude Code / Codex / dsh 可更新；Cursor 仅检测）。
 * dsh 没有自更新命令，只走 npm 全局安装。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, ipcMain } from 'electron';

import { t } from '../i18n';

import { NPM_PKG, fetchNpmLatest, guessInstallMethod, readVersion, resolveCliBin } from './detect';
import { isNewer } from './semver';
import type { CliInstallInfo, CliKind, UpdatableCli } from './types';

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

export interface CliUpdateCache {
  checkedAt: number;
  latest: Partial<Record<CliKind, string | null>>;
}

/** 允许执行的更新命令模板（argv 固定，禁止任意 shell） */
export type UpdateRecipe =
  | { kind: 'claude' | 'codex'; via: 'self'; argv: string[] }
  | { kind: UpdatableCli; via: 'npm'; argv: string[] };

export function updateRecipes(
  kind: UpdatableCli,
  bin: string,
  method: 'npm' | 'native' | 'unknown',
): UpdateRecipe[] {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const recipes: UpdateRecipe[] = [];
  if (kind !== 'dsh' && (method === 'native' || method === 'unknown')) {
    recipes.push({ kind, via: 'self', argv: [bin, 'update'] });
  }
  recipes.push({
    kind,
    via: 'npm',
    argv: [npmCmd, 'install', '-g', `${NPM_PKG[kind]}@latest`],
  });
  return recipes;
}

export function isAllowedUpdateArgv(argv: string[]): boolean {
  if (!argv.length) return false;
  const [cmd, ...rest] = argv;
  const base = path
    .basename(cmd)
    .replace(/\.cmd$/i, '')
    .toLowerCase();
  // claude update / codex update
  if (
    (base === 'claude' || base === 'codex' || cmd.endsWith('claude') || cmd.endsWith('codex')) &&
    rest.length === 1 &&
    rest[0] === 'update'
  ) {
    return true;
  }
  // npm install -g @scope/pkg@latest
  if (base === 'npm' && rest[0] === 'install' && rest[1] === '-g') {
    const pkg = rest[2] ?? '';
    return (
      rest.length === 3 &&
      (pkg === '@anthropic-ai/claude-code@latest' ||
        pkg === '@openai/codex@latest' ||
        pkg === '@deepseek-ai/dsh@latest')
    );
  }
  return false;
}

export function isUpdatable(kind: CliKind): kind is UpdatableCli {
  return kind === 'claude' || kind === 'codex' || kind === 'dsh';
}

function toUpdatable(kind: unknown): UpdatableCli {
  return kind === 'codex' || kind === 'dsh' ? kind : 'claude';
}

export class CliUpdateService {
  private cache: CliUpdateCache = { checkedAt: 0, latest: {} };
  private readonly cachePath: string;
  private updating = false;

  constructor(private readonly d: { root: string; logger: Logger }) {
    this.cachePath = path.join(d.root, 'cache.json');
    fs.mkdirSync(d.root, { recursive: true });
    this.load();
  }

  private load() {
    try {
      this.cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8')) as CliUpdateCache;
    } catch {
      this.cache = { checkedAt: 0, latest: {} };
    }
  }

  private save() {
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf8');
  }

  async inspect(refreshLatest = false): Promise<CliInstallInfo[]> {
    const kinds: CliKind[] = ['claude', 'codex', 'dsh', 'cursor'];
    try {
      if (refreshLatest || Date.now() - this.cache.checkedAt > 6 * 60 * 60_000) {
        const [cl, cx, ds] = await Promise.all([
          fetchNpmLatest(NPM_PKG.claude),
          fetchNpmLatest(NPM_PKG.codex),
          fetchNpmLatest(NPM_PKG.dsh),
        ]);
        this.cache = {
          checkedAt: Date.now(),
          latest: { claude: cl, codex: cx, dsh: ds, cursor: null },
        };
        try {
          this.save();
        } catch {
          /* cache 写失败不影响探测结果 */
        }
      }
      return kinds.map((kind) => {
        let bin: string | null = null;
        let version: string | null = null;
        try {
          const resolved = resolveCliBin(kind);
          bin = resolved;
          version = resolved ? readVersion(resolved) : null;
        } catch {
          /* 探测失败当作未安装 */
        }
        const latest = this.cache.latest[kind] ?? null;
        const method = kind === 'dsh' && bin ? 'npm' : guessInstallMethod(bin);
        const updateSupported = isUpdatable(kind);
        return {
          kind,
          path: bin,
          version,
          latest,
          installMethod: method,
          updateAvailable: Boolean(
            updateSupported && version && latest && isNewer(latest, version),
          ),
          updateSupported,
        };
      });
    } catch (err) {
      this.d.logger.warn('cli-update inspect failed', err);
      return kinds.map((kind) => ({
        kind,
        path: null,
        version: null,
        latest: null,
        installMethod: 'unknown' as const,
        updateAvailable: false,
        updateSupported: isUpdatable(kind),
      }));
    }
  }

  /** 预览将执行的命令（不跑） */
  previewUpdate(
    kind: UpdatableCli,
  ): { argv: string[]; recipes: UpdateRecipe[] } | { error: string } {
    const bin = resolveCliBin(kind);
    if (!bin) return { error: t('{0} 未安装', kind) };
    const method = kind === 'dsh' ? 'npm' : guessInstallMethod(bin);
    const recipes = updateRecipes(kind, bin, method);
    const first = recipes[0]!;
    if (!isAllowedUpdateArgv(first.argv)) return { error: t('更新命令未通过白名单') };
    return { argv: first.argv, recipes };
  }

  async runUpdate(
    kind: UpdatableCli,
  ): Promise<{ ok: boolean; log: string; version: string | null }> {
    if (this.updating) return { ok: false, log: t('已有更新在进行'), version: null };
    const preview = this.previewUpdate(kind);
    if ('error' in preview) return { ok: false, log: preview.error, version: null };
    const argv = preview.argv;
    if (!isAllowedUpdateArgv(argv))
      return { ok: false, log: t('拒绝：命令不在白名单'), version: null };
    this.updating = true;
    this.broadcast({ kind, phase: 'start', argv });
    try {
      const log = await new Promise<string>((resolve, reject) => {
        execFile(
          argv[0]!,
          argv.slice(1),
          { timeout: 10 * 60_000, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
          (err, stdout, stderr) => {
            const body = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
            if (err) reject(new Error(body || err.message));
            else resolve(body);
          },
        );
      });
      const version = readVersion(resolveCliBin(kind) ?? argv[0]!);
      this.broadcast({ kind, phase: 'done', version });
      return { ok: true, log, version };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.broadcast({ kind, phase: 'error', message: msg });
      return { ok: false, log: msg, version: null };
    } finally {
      this.updating = false;
    }
  }

  private broadcast(payload: unknown) {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('ai:cli-update:event', payload);
      } catch {
        /* */
      }
    }
  }

  registerIpc(): void {
    const handle = (ch: string, fn: (...a: unknown[]) => unknown) => {
      ipcMain.removeHandler(ch);
      ipcMain.handle(ch, async (_e, ...a) => {
        try {
          return await fn(...a);
        } catch (err) {
          return { __error: { message: err instanceof Error ? err.message : String(err) } };
        }
      });
    };
    handle('ai:cli-update:inspect', (refresh) => this.inspect(refresh === true));
    handle('ai:cli-update:preview', (kind) => this.previewUpdate(toUpdatable(kind)));
    handle('ai:cli-update:run', (kind) => this.runUpdate(toUpdatable(kind)));
  }
}

let inst: CliUpdateService | null = null;
export function initCliUpdateService(d: { root: string; logger: Logger }): CliUpdateService {
  inst = new CliUpdateService(d);
  return inst;
}
export function getCliUpdateService(): CliUpdateService | null {
  return inst;
}
