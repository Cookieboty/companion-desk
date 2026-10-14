/**
 * CLI 供应商档案 + 写入 ~/.claude / ~/.codex（备份后只改连接字段）。
 * Key 使用 Electron safeStorage；检测到 ~/.cc-switch 时对 UI 发出警告（选项 A：警告并继续）。
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BrowserWindow, ipcMain, safeStorage } from 'electron';

import { t } from '../i18n';

import {
  backupFile,
  claudeSettingsPath,
  codexAuthPath,
  codexConfigPath,
  ensureDir,
  hasCcSwitch,
  patchClaudeSettings,
  patchCodexAuth,
  patchCodexToml,
} from './configPatch';
import type { CliProviderInput, CliProviderProfile } from './types';

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

interface StoredProfile {
  id: string;
  kind: 'claude' | 'codex';
  name: string;
  baseUrl: string;
  model: string;
  /** safeStorage 密文 base64；无 key 时为空 */
  keyEnc: string;
  active: boolean;
}

interface StoreFile {
  profiles: StoredProfile[];
}

function encrypt(plain: string): string {
  if (!plain) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plain).toString('base64');
    }
  } catch {
    /* */
  }
  return Buffer.from(plain, 'utf8').toString('base64');
}

function decrypt(enc: string): string {
  if (!enc) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    }
  } catch {
    /* */
  }
  try {
    return Buffer.from(enc, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function mask(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return `${key.slice(0, 2)}••••${key.slice(-2)}`;
}

export class CliProviderBridge {
  private data: StoreFile = { profiles: [] };
  private readonly storePath: string;
  private readonly backupRoot: string;
  private readonly home: string;

  constructor(private readonly d: { root: string; logger: Logger; home?: string }) {
    this.home = d.home ?? os.homedir();
    this.storePath = path.join(d.root, 'store.json');
    this.backupRoot = path.join(d.root, 'backups');
    fs.mkdirSync(d.root, { recursive: true });
    this.load();
  }

  private load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.storePath, 'utf8')) as StoreFile;
      if (!Array.isArray(this.data.profiles)) this.data.profiles = [];
    } catch {
      this.data = { profiles: [] };
    }
  }

  private save() {
    fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  private toView(p: StoredProfile): CliProviderProfile {
    const key = decrypt(p.keyEnc);
    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      hasKey: Boolean(key),
      keyHint: mask(key),
      active: p.active,
    };
  }

  state(): {
    profiles: CliProviderProfile[];
    ccSwitchWarning: boolean;
    claudeSettings: string;
    codexConfig: string;
  } {
    return {
      profiles: this.data.profiles.map((p) => this.toView(p)),
      ccSwitchWarning: hasCcSwitch(this.home),
      claudeSettings: claudeSettingsPath(this.home),
      codexConfig: codexConfigPath(this.home),
    };
  }

  upsert(input: CliProviderInput): CliProviderProfile {
    const id = input.id?.trim() || randomUUID();
    const existing = this.data.profiles.find((p) => p.id === id);
    const keyEnc =
      input.apiKey !== undefined && input.apiKey !== ''
        ? encrypt(input.apiKey)
        : (existing?.keyEnc ?? '');
    const next: StoredProfile = {
      id,
      kind: input.kind,
      name: input.name.trim() || t('未命名'),
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      keyEnc,
      active: existing?.active ?? false,
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      this.data.profiles.push(next);
    }
    this.save();
    this.broadcast();
    return this.toView(next);
  }

  remove(id: string): void {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id);
    this.save();
    this.broadcast();
  }

  /**
   * 启用档案：备份现有配置 → 写入连接字段 → 同 kind 其它档案取消 active。
   * 返回备份路径与是否提示重启（Codex）。
   */
  activate(id: string): {
    ok: boolean;
    backups: string[];
    restartRequired: boolean;
    ccSwitchWarning: boolean;
    error?: string;
  } {
    const p = this.data.profiles.find((x) => x.id === id);
    if (!p)
      return {
        ok: false,
        backups: [],
        restartRequired: false,
        ccSwitchWarning: hasCcSwitch(this.home),
        error: t('档案不存在'),
      };
    const key = decrypt(p.keyEnc);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backups: string[] = [];

    try {
      if (p.kind === 'claude') {
        const settings = claudeSettingsPath(this.home);
        const b = backupFile(settings, path.join(this.backupRoot, ts), 'claude-settings.json');
        if (b) backups.push(b);
        ensureDir(settings);
        const raw = fs.existsSync(settings) ? fs.readFileSync(settings, 'utf8') : null;
        const next = patchClaudeSettings(raw, {
          ANTHROPIC_API_KEY: key || undefined,
          ANTHROPIC_BASE_URL: p.baseUrl || undefined,
          ANTHROPIC_MODEL: p.model || undefined,
        });
        fs.writeFileSync(settings, next, 'utf8');
      } else {
        const conf = codexConfigPath(this.home);
        const auth = codexAuthPath(this.home);
        const b1 = backupFile(conf, path.join(this.backupRoot, ts), 'codex-config.toml');
        const b2 = backupFile(auth, path.join(this.backupRoot, ts), 'codex-auth.json');
        if (b1) backups.push(b1);
        if (b2) backups.push(b2);
        ensureDir(conf);
        ensureDir(auth);
        const rawConf = fs.existsSync(conf) ? fs.readFileSync(conf, 'utf8') : null;
        const rawAuth = fs.existsSync(auth) ? fs.readFileSync(auth, 'utf8') : null;
        fs.writeFileSync(
          conf,
          patchCodexToml(rawConf, {
            model: p.model || undefined,
            model_provider: 'nomi',
            providerName: 'nomi',
            base_url: p.baseUrl || undefined,
          }),
          'utf8',
        );
        fs.writeFileSync(auth, patchCodexAuth(rawAuth, key || undefined), 'utf8');
      }
      for (const x of this.data.profiles) {
        if (x.kind === p.kind) x.active = x.id === id;
      }
      this.save();
      this.broadcast();
      return {
        ok: true,
        backups,
        restartRequired: p.kind === 'codex',
        ccSwitchWarning: hasCcSwitch(this.home),
      };
    } catch (e) {
      return {
        ok: false,
        backups,
        restartRequired: false,
        ccSwitchWarning: hasCcSwitch(this.home),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** 从最近一次备份目录恢复（测试 / 用户撤销） */
  restoreBackup(tsDir: string): { ok: boolean; error?: string } {
    const root = path.join(this.backupRoot, tsDir);
    if (!fs.existsSync(root)) return { ok: false, error: t('备份不存在') };
    try {
      const cl = path.join(root, 'claude-settings.json');
      const ct = path.join(root, 'codex-config.toml');
      const ca = path.join(root, 'codex-auth.json');
      if (fs.existsSync(cl)) {
        ensureDir(claudeSettingsPath(this.home));
        fs.copyFileSync(cl, claudeSettingsPath(this.home));
      }
      if (fs.existsSync(ct)) {
        ensureDir(codexConfigPath(this.home));
        fs.copyFileSync(ct, codexConfigPath(this.home));
      }
      if (fs.existsSync(ca)) {
        ensureDir(codexAuthPath(this.home));
        fs.copyFileSync(ca, codexAuthPath(this.home));
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  listBackups(): string[] {
    try {
      return fs
        .readdirSync(this.backupRoot)
        .filter((n) => fs.statSync(path.join(this.backupRoot, n)).isDirectory())
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  private broadcast() {
    const s = this.state();
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('ai:cli-provider:changed', s);
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
    handle('ai:cli-provider:state', () => this.state());
    handle('ai:cli-provider:upsert', (p) => this.upsert(p as CliProviderInput));
    handle('ai:cli-provider:remove', (id) => {
      this.remove(String(id));
      return this.state();
    });
    handle('ai:cli-provider:activate', (id) => this.activate(String(id)));
    handle('ai:cli-provider:backups', () => this.listBackups());
    handle('ai:cli-provider:restore', (ts) => this.restoreBackup(String(ts)));
  }
}

let inst: CliProviderBridge | null = null;
export function initCliProviderBridge(d: {
  root: string;
  logger: Logger;
  home?: string;
}): CliProviderBridge {
  inst = new CliProviderBridge(d);
  return inst;
}
export function getCliProviderBridge(): CliProviderBridge | null {
  return inst;
}
