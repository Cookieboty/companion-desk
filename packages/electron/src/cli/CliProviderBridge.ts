/**
 * Claude Code / Codex **各自独立** 的供应商档案。
 * - 存储：userData/cli-providers/claude/store.json 与 …/codex/store.json
 * - 写入：Claude → ~/.claude/settings.json；Codex → ~/.codex/config.toml + auth.json
 * - 与 Nomi 自有 ProviderStore（ai-providers.json）完全隔离
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
  patchClaudeSettings,
  patchCodexAuth,
  patchCodexToml,
} from './configPatch';
import {
  type ClaudeApiFormat,
  type CliApiFormat,
  type CodexApiFormat,
  defaultFormat,
  formatNeedsRouting,
  isClaudeApiFormat,
  isCodexApiFormat,
} from './formats';
import { getCliRouteService, type RouteUpstream } from './routing/CliRouteService';
import type { CliProviderInput, CliProviderProfile } from './types';

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

interface StoredProfile {
  id: string;
  kind: 'claude' | 'codex';
  name: string;
  baseUrl: string;
  model: string;
  apiFormat: CliApiFormat;
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

function normalizeFormat(kind: 'claude' | 'codex', raw: unknown): CliApiFormat {
  if (kind === 'claude' && isClaudeApiFormat(raw)) return raw;
  if (kind === 'codex' && isCodexApiFormat(raw)) return raw;
  return defaultFormat(kind);
}

export class CliProviderBridge {
  private readonly home: string;
  private readonly backupRoot: string;
  private readonly storePaths: Record<'claude' | 'codex', string>;
  private data: Record<'claude' | 'codex', StoreFile> = {
    claude: { profiles: [] },
    codex: { profiles: [] },
  };

  constructor(private readonly d: { root: string; logger: Logger; home?: string }) {
    this.home = d.home ?? os.homedir();
    this.backupRoot = path.join(d.root, 'backups');
    this.storePaths = {
      claude: path.join(d.root, 'claude', 'store.json'),
      codex: path.join(d.root, 'codex', 'store.json'),
    };
    // migrate legacy single store.json if present
    this.migrateLegacy(path.join(d.root, 'store.json'));
    this.loadKind('claude');
    this.loadKind('codex');
  }

  private migrateLegacy(legacyPath: string) {
    if (!fs.existsSync(legacyPath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as {
        profiles?: Array<StoredProfile & { apiFormat?: string }>;
      };
      for (const p of raw.profiles ?? []) {
        if (p.kind !== 'claude' && p.kind !== 'codex') continue;
        const fmt = normalizeFormat(p.kind, p.apiFormat);
        this.data[p.kind].profiles.push({ ...p, apiFormat: fmt });
      }
      this.saveKind('claude');
      this.saveKind('codex');
      fs.renameSync(legacyPath, `${legacyPath}.migrated`);
    } catch (e) {
      this.d.logger.warn('legacy cli provider migrate failed', e);
    }
  }

  private loadKind(kind: 'claude' | 'codex') {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePaths[kind], 'utf8')) as StoreFile;
      this.data[kind] = {
        profiles: (parsed.profiles ?? []).map((p) => ({
          ...p,
          kind,
          apiFormat: normalizeFormat(kind, p.apiFormat),
        })),
      };
    } catch {
      this.data[kind] = { profiles: [] };
    }
  }

  private saveKind(kind: 'claude' | 'codex') {
    const file = this.storePaths[kind];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(this.data[kind], null, 2), 'utf8');
  }

  private allProfiles(): StoredProfile[] {
    return [...this.data.claude.profiles, ...this.data.codex.profiles];
  }

  private toView(p: StoredProfile): CliProviderProfile {
    const key = decrypt(p.keyEnc);
    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      apiFormat: p.apiFormat,
      needsRouting: formatNeedsRouting(p.kind, p.apiFormat),
      hasKey: Boolean(key),
      keyHint: mask(key),
      active: p.active,
    };
  }

  /** 供本地路由读取当前启用上游（含明文 key，仅主进程） */
  resolveUpstream(kind: 'claude' | 'codex'): RouteUpstream | null {
    const p = this.data[kind].profiles.find((x) => x.active);
    if (!p) return null;
    return {
      kind,
      baseUrl: p.baseUrl,
      apiKey: decrypt(p.keyEnc),
      model: p.model,
      apiFormat: p.apiFormat,
    };
  }

  state() {
    const route = getCliRouteService()?.getSettings();
    return {
      profiles: this.allProfiles().map((p) => this.toView(p)),
      claudeStore: this.storePaths.claude,
      codexStore: this.storePaths.codex,
      claudeSettings: claudeSettingsPath(this.home),
      codexConfig: codexConfigPath(this.home),
      routing: route ?? null,
    };
  }

  upsert(input: CliProviderInput): CliProviderProfile {
    const kind = input.kind;
    const id = input.id?.trim() || randomUUID();
    const existing = this.data[kind].profiles.find((p) => p.id === id);
    const keyEnc =
      input.apiKey !== undefined && input.apiKey !== ''
        ? encrypt(input.apiKey)
        : (existing?.keyEnc ?? '');
    const apiFormat = normalizeFormat(kind, input.apiFormat ?? existing?.apiFormat);
    const next: StoredProfile = {
      id,
      kind,
      name: input.name.trim() || t('未命名'),
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      apiFormat,
      keyEnc,
      active: existing?.active ?? false,
    };
    if (existing) Object.assign(existing, next);
    else this.data[kind].profiles.push(next);
    this.saveKind(kind);
    this.broadcast();
    return this.toView(next);
  }

  remove(id: string): void {
    for (const kind of ['claude', 'codex'] as const) {
      const before = this.data[kind].profiles.length;
      this.data[kind].profiles = this.data[kind].profiles.filter((p) => p.id !== id);
      if (this.data[kind].profiles.length !== before) this.saveKind(kind);
    }
    this.broadcast();
  }

  activate(id: string): {
    ok: boolean;
    backups: string[];
    restartRequired: boolean;
    usedRouting: boolean;
    error?: string;
  } {
    const p = this.allProfiles().find((x) => x.id === id);
    if (!p) {
      return {
        ok: false,
        backups: [],
        restartRequired: false,
        usedRouting: false,
        error: t('档案不存在'),
      };
    }
    const key = decrypt(p.keyEnc);
    const needs = formatNeedsRouting(p.kind, p.apiFormat);
    const route = getCliRouteService();
    const routeSettings = route?.getSettings();
    const routingOn = Boolean(routeSettings?.enabled && routeSettings?.[p.kind]);
    if (needs && !routingOn) {
      return {
        ok: false,
        backups: [],
        restartRequired: false,
        usedRouting: false,
        error: t('该上游格式需要先开启本地路由（高级设置）'),
      };
    }
    const useRoute = needs;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backups: string[] = [];
    try {
      if (p.kind === 'claude') {
        const settings = claudeSettingsPath(this.home);
        const b = backupFile(settings, path.join(this.backupRoot, ts), 'claude-settings.json');
        if (b) backups.push(b);
        ensureDir(settings);
        const raw = fs.existsSync(settings) ? fs.readFileSync(settings, 'utf8') : null;
        const baseUrl = useRoute ? (route?.cliBaseUrl('claude') ?? p.baseUrl) : p.baseUrl;
        const next = patchClaudeSettings(raw, {
          ANTHROPIC_API_KEY: useRoute ? 'nomi-route' : key || undefined,
          ANTHROPIC_BASE_URL: baseUrl || undefined,
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
        const baseUrl = useRoute ? (route?.cliBaseUrl('codex') ?? p.baseUrl) : p.baseUrl;
        fs.writeFileSync(
          conf,
          patchCodexToml(rawConf, {
            model: p.model || undefined,
            model_provider: 'nomi',
            providerName: 'nomi',
            base_url: baseUrl || undefined,
            wire_api: 'responses',
          }),
          'utf8',
        );
        fs.writeFileSync(
          auth,
          patchCodexAuth(rawAuth, useRoute ? 'nomi-route' : key || undefined),
          'utf8',
        );
      }
      for (const x of this.data[p.kind].profiles) x.active = x.id === id;
      this.saveKind(p.kind);
      this.broadcast();
      return {
        ok: true,
        backups,
        restartRequired: p.kind === 'codex' && !useRoute,
        usedRouting: Boolean(useRoute),
      };
    } catch (e) {
      return {
        ok: false,
        backups,
        restartRequired: false,
        usedRouting: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

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
