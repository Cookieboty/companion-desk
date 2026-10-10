/**
 * ProviderStore —— 多 provider 配置 + Token 服务的本地存储（仅主进程）。
 *
 * 数据只落在 `userData/ai-providers.json`（0600）。API key 用 SecretCipher 加密后存储；
 * 对外（IPC / 渲染进程）只给 `ProviderView`：key 只有掩码与元数据，**永不回传明文**。
 * 明文只通过 `resolveKeys()` 交给主进程内的 LLM provider 工厂。
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { AiSdkBackend } from '../ai-sdk/AiSdkLlmProvider';

import { findPreset } from './presets';
import { maskSecret, type SecretCipher } from './secretCipher';

export const PROVIDER_ROLES = ['chat', 'agent-tools', 'summary'] as const;
export type ProviderRole = (typeof PROVIDER_ROLES)[number];

export interface StoredKey {
  id: string;
  label?: string;
  /** cipher.encrypt(key) */
  secret: string;
  encryption: SecretCipher['kind'];
  /** 掩码（加密前算好，避免为显示而解密） */
  masked: string;
  createdAt: number;
  lastUsedAt?: number;
  lastError?: string;
}

export interface StoredProvider {
  id: string;
  presetId: string;
  name: string;
  backend: AiSdkBackend;
  baseURL: string;
  defaultModel: string;
  headers?: Record<string, string>;
  enabled: boolean;
  /** 顺序即 fallback 顺序：第一个为主 key */
  keys: StoredKey[];
  createdAt: number;
  updatedAt: number;
}

export interface RouteBinding {
  providerId: string;
  model?: string;
}

export interface ProviderUsage {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastUsedAt?: number;
}

export interface ProviderStoreData {
  version: 1;
  providers: StoredProvider[];
  activeProviderId?: string;
  routes: Partial<Record<ProviderRole, RouteBinding>>;
  usage: Record<string, ProviderUsage>;
}

/** 渲染进程可见的视图（无明文、无密文） */
export interface ProviderView {
  id: string;
  presetId: string;
  name: string;
  backend: AiSdkBackend;
  baseURL: string;
  defaultModel: string;
  headers?: Record<string, string>;
  enabled: boolean;
  active: boolean;
  keys: Array<{
    id: string;
    label?: string;
    masked: string;
    encryption: SecretCipher['kind'];
    createdAt: number;
    lastUsedAt?: number;
    lastError?: string;
  }>;
  usage: ProviderUsage;
  source: 'store';
}

export interface ProviderInput {
  id?: string;
  presetId?: string;
  name?: string;
  backend?: AiSdkBackend;
  baseURL?: string;
  defaultModel?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  /** 新建时可直接带 key（明文，仅此一次经 IPC 进入主进程） */
  apiKey?: string;
}

export interface ProviderStoreOptions {
  /** JSON 文件路径（通常 `userData/ai-providers.json`）；省略则仅内存（测试） */
  filePath?: string;
  cipher: SecretCipher;
  now?: () => number;
  /** usage 写盘节流（ms），默认 2000 */
  usageFlushMs?: number;
}

const emptyUsage = (): ProviderUsage => ({
  requests: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
});

const BACKENDS: readonly AiSdkBackend[] = ['openai-compatible', 'anthropic', 'google'];

function sanitizeHeaders(h: unknown): Record<string, string> | undefined {
  if (!h || typeof h !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    const name = k.trim();
    if (!name || !/^[A-Za-z0-9-]+$/.test(name)) throw new Error(`非法 header 名: ${k}`);
    if (typeof v !== 'string') continue;
    out[name] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeBaseURL(u: string): string {
  const s = u.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) throw new Error(`baseURL 必须以 http(s):// 开头: ${u}`);
  return s;
}

export class ProviderStore {
  private data: ProviderStoreData;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private usageTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly opts: ProviderStoreOptions) {
    this.now = opts.now ?? Date.now;
    this.data = this.load();
  }

  get encryption(): SecretCipher['kind'] {
    return this.opts.cipher.kind;
  }

  // ---------------------------------------------------------------- persistence
  private load(): ProviderStoreData {
    const empty: ProviderStoreData = { version: 1, providers: [], routes: {}, usage: {} };
    const file = this.opts.filePath;
    if (!file || !fs.existsSync(file)) return empty;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ProviderStoreData>;
      return {
        version: 1,
        providers: Array.isArray(raw.providers) ? raw.providers : [],
        activeProviderId: raw.activeProviderId,
        routes: raw.routes && typeof raw.routes === 'object' ? raw.routes : {},
        usage: raw.usage && typeof raw.usage === 'object' ? raw.usage : {},
      };
    } catch {
      // 损坏的文件挪到一边，不覆盖用户数据
      try {
        fs.renameSync(file, `${file}.corrupt-${this.now()}`);
      } catch {
        /* ignore */
      }
      return empty;
    }
  }

  private persist(): void {
    const file = this.opts.filePath;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  private commit(): void {
    this.persist();
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* listener errors must not break the store */
      }
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 立即写出节流中的 usage（退出前调用）。 */
  flush(): void {
    if (this.usageTimer) {
      clearTimeout(this.usageTimer);
      this.usageTimer = undefined;
      this.persist();
    }
  }

  // ---------------------------------------------------------------- queries
  private mustGet(id: string): StoredProvider {
    const p = this.data.providers.find((x) => x.id === id);
    if (!p) throw new Error(`provider '${id}' 不存在`);
    return p;
  }

  has(id: string): boolean {
    return this.data.providers.some((p) => p.id === id);
  }

  /** 主进程内部使用（含密文，不含明文）。 */
  providers(): readonly StoredProvider[] {
    return this.data.providers;
  }

  activeProviderId(): string | undefined {
    return this.data.activeProviderId;
  }

  route(role: ProviderRole): RouteBinding | undefined {
    return this.data.routes[role];
  }

  routes(): Partial<Record<ProviderRole, RouteBinding>> {
    return { ...this.data.routes };
  }

  /** 解密该 provider 的 key（fallback 顺序）。**仅供主进程 provider 工厂使用。** */
  resolveKeys(id: string): string[] {
    const p = this.mustGet(id);
    const out: string[] = [];
    for (const k of p.keys) {
      try {
        out.push(
          k.encryption === this.opts.cipher.kind
            ? this.opts.cipher.decrypt(k.secret)
            : Buffer.from(k.secret, 'base64').toString('utf8'),
        );
      } catch {
        // 解密失败（换机 / keyring 变化）：跳过该 key，并在视图里标出
        k.lastError = '无法解密（系统密钥环可能已变化），请重新填写';
      }
    }
    return out;
  }

  list(): ProviderView[] {
    return this.data.providers.map((p) => this.view(p));
  }

  view(p: StoredProvider): ProviderView {
    return {
      id: p.id,
      presetId: p.presetId,
      name: p.name,
      backend: p.backend,
      baseURL: p.baseURL,
      defaultModel: p.defaultModel,
      headers: p.headers ? { ...p.headers } : undefined,
      enabled: p.enabled,
      active: this.data.activeProviderId === p.id,
      keys: p.keys.map((k) => ({
        id: k.id,
        label: k.label,
        masked: k.masked,
        encryption: k.encryption,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        lastError: k.lastError,
      })),
      usage: { ...emptyUsage(), ...this.data.usage[p.id] },
      source: 'store',
    };
  }

  usage(): Record<string, ProviderUsage> {
    return JSON.parse(JSON.stringify(this.data.usage)) as Record<string, ProviderUsage>;
  }

  // ---------------------------------------------------------------- mutations
  upsert(input: ProviderInput): ProviderView {
    const ts = this.now();
    const existing = input.id ? this.data.providers.find((p) => p.id === input.id) : undefined;
    if (existing) {
      if (input.name !== undefined) existing.name = input.name.trim() || existing.name;
      if (input.backend !== undefined) {
        if (!BACKENDS.includes(input.backend)) throw new Error(`未知 backend: ${input.backend}`);
        existing.backend = input.backend;
      }
      if (input.baseURL !== undefined) existing.baseURL = normalizeBaseURL(input.baseURL);
      if (input.defaultModel !== undefined)
        existing.defaultModel = input.defaultModel.trim() || existing.defaultModel;
      if (input.headers !== undefined) existing.headers = sanitizeHeaders(input.headers);
      if (input.enabled !== undefined) existing.enabled = Boolean(input.enabled);
      if (input.apiKey?.trim()) existing.keys.unshift(this.makeKey(input.apiKey));
      existing.updatedAt = ts;
      this.commit();
      return this.view(existing);
    }
    const preset = findPreset(input.presetId) ?? findPreset('custom')!;
    const backend = input.backend ?? preset.backend;
    if (!BACKENDS.includes(backend)) throw new Error(`未知 backend: ${backend}`);
    const created: StoredProvider = {
      id: `p-${preset.id}-${randomUUID().slice(0, 8)}`,
      presetId: preset.id,
      name: input.name?.trim() || preset.name,
      backend,
      baseURL: normalizeBaseURL(input.baseURL ?? preset.baseURL),
      defaultModel: input.defaultModel?.trim() || preset.defaultModel,
      headers: sanitizeHeaders(input.headers),
      enabled: input.enabled ?? true,
      keys: input.apiKey?.trim() ? [this.makeKey(input.apiKey)] : [],
      createdAt: ts,
      updatedAt: ts,
    };
    this.data.providers.push(created);
    this.commit();
    return this.view(created);
  }

  remove(id: string): void {
    this.mustGet(id);
    this.data.providers = this.data.providers.filter((p) => p.id !== id);
    if (this.data.activeProviderId === id) this.data.activeProviderId = undefined;
    for (const role of PROVIDER_ROLES) {
      if (this.data.routes[role]?.providerId === id) delete this.data.routes[role];
    }
    delete this.data.usage[id];
    this.commit();
  }

  /**
   * 设为当前 provider；`undefined` 表示回到环境变量默认。
   * id 也可以是环境变量 provider（如 `deepseek`）——合法性由调用方（IPC 层 / registry）校验。
   */
  setActive(id: string | undefined): void {
    const p = id !== undefined ? this.data.providers.find((x) => x.id === id) : undefined;
    if (p && !p.enabled) p.enabled = true;
    this.data.activeProviderId = id;
    this.commit();
  }

  setRoute(role: ProviderRole, binding: RouteBinding | null): void {
    if (!PROVIDER_ROLES.includes(role)) throw new Error(`未知 role: ${role}`);
    if (binding === null || !binding.providerId) {
      delete this.data.routes[role];
    } else {
      this.data.routes[role] = {
        providerId: binding.providerId,
        model: binding.model?.trim() || undefined,
      };
    }
    this.commit();
  }

  private makeKey(plain: string, label?: string): StoredKey {
    const key = plain.trim();
    if (!key) throw new Error('API key 不能为空');
    if (/\s/.test(key)) throw new Error('API key 不能包含空白字符');
    return {
      id: `k-${randomUUID().slice(0, 8)}`,
      label: label?.trim() || undefined,
      secret: this.opts.cipher.encrypt(key),
      encryption: this.opts.cipher.kind,
      masked: maskSecret(key),
      createdAt: this.now(),
    };
  }

  addKey(id: string, plain: string, label?: string): ProviderView {
    const p = this.mustGet(id);
    p.keys.push(this.makeKey(plain, label));
    p.updatedAt = this.now();
    this.commit();
    return this.view(p);
  }

  /** 轮换：用新值替换某个 key（保留位置与标签）。 */
  rotateKey(id: string, keyId: string, plain: string): ProviderView {
    const p = this.mustGet(id);
    const idx = p.keys.findIndex((k) => k.id === keyId);
    if (idx < 0) throw new Error(`key '${keyId}' 不存在`);
    const next = this.makeKey(plain, p.keys[idx]!.label);
    p.keys[idx] = next;
    p.updatedAt = this.now();
    this.commit();
    return this.view(p);
  }

  removeKey(id: string, keyId: string): ProviderView {
    const p = this.mustGet(id);
    const before = p.keys.length;
    p.keys = p.keys.filter((k) => k.id !== keyId);
    if (p.keys.length === before) throw new Error(`key '${keyId}' 不存在`);
    p.updatedAt = this.now();
    this.commit();
    return this.view(p);
  }

  /** 设为主 key（移到 fallback 队列最前）。 */
  promoteKey(id: string, keyId: string): ProviderView {
    const p = this.mustGet(id);
    const k = p.keys.find((x) => x.id === keyId);
    if (!k) throw new Error(`key '${keyId}' 不存在`);
    p.keys = [k, ...p.keys.filter((x) => x !== k)];
    p.updatedAt = this.now();
    this.commit();
    return this.view(p);
  }

  /** key 调用结果（fallback 用）：不触发 onChange，避免频繁重建 provider。 */
  markKey(id: string, keyIndex: number, error?: string): void {
    const p = this.data.providers.find((x) => x.id === id);
    const k = p?.keys[keyIndex];
    if (!k) return;
    k.lastUsedAt = this.now();
    k.lastError = error ? error.slice(0, 200) : undefined;
    this.scheduleUsageFlush();
  }

  recordUsage(
    id: string,
    u: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined,
    ok: boolean,
  ): void {
    const cur = { ...emptyUsage(), ...this.data.usage[id] };
    cur.requests += 1;
    if (!ok) cur.errors += 1;
    cur.inputTokens += u?.inputTokens ?? 0;
    cur.outputTokens += u?.outputTokens ?? 0;
    cur.totalTokens += u?.totalTokens ?? (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0);
    cur.lastUsedAt = this.now();
    this.data.usage[id] = cur;
    this.scheduleUsageFlush();
  }

  resetUsage(id?: string): void {
    if (id) delete this.data.usage[id];
    else this.data.usage = {};
    this.commit();
  }

  private scheduleUsageFlush(): void {
    if (!this.opts.filePath || this.usageTimer) return;
    this.usageTimer = setTimeout(() => {
      this.usageTimer = undefined;
      try {
        this.persist();
      } catch {
        /* best effort */
      }
    }, this.opts.usageFlushMs ?? 2000);
    (this.usageTimer as { unref?: () => void }).unref?.();
  }
}
