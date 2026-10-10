/**
 * ProviderService —— 面板 / 托盘使用的 provider 管理门面（主进程）。
 *
 * 只返回视图（掩码 key），所有明文 key 的使用都在主进程内完成。
 */
import type { LLMProviderEntry } from '@ig-live/bundle-ig-base';

import { PROVIDER_DEFAULTS } from '../ai-sdk/AiSdkLlmProvider';

import { PROVIDER_PRESETS, findPreset, type ProviderPreset } from './presets';
import {
  defaultProviderFactory,
  type ProviderFactory,
  type RoutedLLMRegistry,
} from './ProviderRouter';
import {
  PROVIDER_ROLES,
  type ProviderInput,
  type ProviderRole,
  type ProviderStore,
  type ProviderUsage,
  type ProviderView,
  type RouteBinding,
} from './ProviderStore';

export interface EnvProviderView {
  id: string;
  name: string;
  baseURL?: string;
  defaultModel?: string;
  hasKey: boolean;
  /** 本地服务（如 Ollama），无需 key */
  keyless: boolean;
  active: boolean;
  usage: ProviderUsage;
  source: 'env';
}

export interface ProviderState {
  providers: ProviderView[];
  envProviders: EnvProviderView[];
  activeProviderId?: string;
  /** 实际生效的默认 provider（考虑 override / env fallback） */
  effectiveProviderId?: string;
  routes: Partial<Record<ProviderRole, RouteBinding>>;
  roles: readonly ProviderRole[];
  encryption: 'safeStorage' | 'none';
  overrideId?: string;
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  error?: string;
  /** 仅为 UI 提示：返回内容前 40 字 */
  sample?: string;
}

export interface ProviderServiceOptions {
  store: ProviderStore;
  envEntries: LLMProviderEntry[];
  getRegistry: () => RoutedLLMRegistry | undefined;
  factory?: ProviderFactory;
  overrideId?: string;
  testTimeoutMs?: number;
}

/** 把 key / token 样式的片段从错误信息里抹掉，避免经 UI / 日志泄露。 */
export function redactSecrets(msg: string, secrets: string[] = []): string {
  let out = msg;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('***');
  return out.replace(/\b(sk|key|AIza)[-_A-Za-z0-9]{12,}\b/g, '***').slice(0, 300);
}

export class ProviderService {
  constructor(private readonly opts: ProviderServiceOptions) {}

  onChange(listener: () => void): () => void {
    return this.opts.store.onChange(listener);
  }

  presets(): readonly ProviderPreset[] {
    return PROVIDER_PRESETS;
  }

  state(): ProviderState {
    const { store } = this.opts;
    const usage = store.usage();
    const activeId = store.activeProviderId();
    const effective = this.opts.getRegistry()?.resolve('chat')?.provider.id;
    return {
      providers: store.list(),
      envProviders: this.opts.envEntries.map((e) => {
        const d = PROVIDER_DEFAULTS[e.id];
        return {
          id: e.id,
          name: findPreset(e.id)?.name ?? e.id,
          baseURL: e.baseURL ?? d?.baseURL,
          defaultModel: e.model ?? d?.model,
          hasKey: Boolean(e.apiKey) || d?.requiresApiKey === false,
          keyless: d?.requiresApiKey === false,
          active: activeId === e.id,
          usage: {
            requests: 0,
            errors: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            ...usage[e.id],
          },
          source: 'env' as const,
        };
      }),
      activeProviderId: activeId,
      effectiveProviderId: effective,
      routes: store.routes(),
      roles: PROVIDER_ROLES,
      encryption: store.encryption,
      overrideId: this.opts.overrideId,
    };
  }

  private assertKnown(id: string): void {
    const known = this.opts.store.has(id) || this.opts.envEntries.some((e) => e.id === id);
    if (!known) throw new Error(`provider '${id}' 不存在`);
  }

  upsert(input: ProviderInput): ProviderView {
    return this.opts.store.upsert(input);
  }

  remove(id: string): void {
    this.opts.store.remove(id);
  }

  setActive(id: string | null): ProviderState {
    if (id) this.assertKnown(id);
    this.opts.store.setActive(id ?? undefined);
    return this.state();
  }

  setRoute(role: ProviderRole, binding: RouteBinding | null): ProviderState {
    if (binding?.providerId) this.assertKnown(binding.providerId);
    this.opts.store.setRoute(role, binding);
    return this.state();
  }

  addKey(id: string, key: string, label?: string): ProviderView {
    return this.opts.store.addKey(id, key, label);
  }

  rotateKey(id: string, keyId: string, key: string): ProviderView {
    return this.opts.store.rotateKey(id, keyId, key);
  }

  removeKey(id: string, keyId: string): ProviderView {
    return this.opts.store.removeKey(id, keyId);
  }

  promoteKey(id: string, keyId: string): ProviderView {
    return this.opts.store.promoteKey(id, keyId);
  }

  resetUsage(id?: string): void {
    this.opts.store.resetUsage(id);
  }

  /** 测试已保存 provider 的某个 key（默认主 key）。 */
  async test(id: string, keyId?: string): Promise<TestResult> {
    const { store } = this.opts;
    const p = store.providers().find((x) => x.id === id);
    if (!p) {
      // env provider：走 registry 里的实例
      const reg = this.opts.getRegistry();
      const prov = reg?.get(id);
      if (!prov) throw new Error(`provider '${id}' 不存在`);
      return this.ping(() =>
        prov.chat({
          reqId: `test-${Date.now()}`,
          provider: id,
          model: 'default',
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 16,
          stream: false,
        }),
      );
    }
    const keys = store.resolveKeys(id);
    const idx = keyId ? p.keys.findIndex((k) => k.id === keyId) : 0;
    if (keyId && idx < 0) throw new Error(`key '${keyId}' 不存在`);
    const apiKey = keys[idx];
    const result = await this.pingWith(
      {
        backend: p.backend,
        baseURL: p.baseURL,
        defaultModel: p.defaultModel,
        headers: p.headers,
        apiKey,
      },
      apiKey ? [apiKey] : [],
    );
    store.markKey(id, Math.max(idx, 0), result.ok ? undefined : result.error);
    return result;
  }

  /** 测试尚未保存的草稿（面板「粘贴 key → 测试 → 保存」流程）。 */
  async testDraft(input: ProviderInput): Promise<TestResult> {
    const preset = findPreset(input.presetId) ?? findPreset('custom')!;
    return this.pingWith(
      {
        backend: input.backend ?? preset.backend,
        baseURL: (input.baseURL ?? preset.baseURL).trim().replace(/\/+$/, ''),
        defaultModel: input.defaultModel?.trim() || preset.defaultModel,
        headers: input.headers,
        apiKey: input.apiKey?.trim() || undefined,
      },
      input.apiKey ? [input.apiKey.trim()] : [],
    );
  }

  private async pingWith(
    cfg: {
      backend: ProviderPreset['backend'];
      baseURL: string;
      defaultModel: string;
      headers?: Record<string, string>;
      apiKey?: string;
    },
    secrets: string[],
  ): Promise<TestResult> {
    const factory = this.opts.factory ?? defaultProviderFactory;
    let provider;
    try {
      provider = factory({
        id: 'connectivity-test',
        backend: cfg.backend,
        baseURL: cfg.baseURL,
        defaultModel: cfg.defaultModel,
        headers: cfg.headers,
        apiKey: cfg.apiKey,
        requiresApiKey: false,
      });
    } catch (err) {
      return {
        ok: false,
        latencyMs: 0,
        error: redactSecrets(String((err as Error).message), secrets),
      };
    }
    const res = await this.ping(
      () =>
        provider.chat({
          reqId: `test-${Date.now()}`,
          provider: 'connectivity-test',
          model: cfg.defaultModel,
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 16,
          stream: false,
        }),
      secrets,
    );
    return { ...res, model: cfg.defaultModel };
  }

  private async ping(
    run: () => Promise<{ content: string; model?: string }>,
    secrets: string[] = [],
  ): Promise<TestResult> {
    const t0 = Date.now();
    const timeoutMs = this.opts.testTimeoutMs ?? 15_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const res = await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`超时（${timeoutMs}ms）`)), timeoutMs);
        }),
      ]);
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        model: res.model,
        sample: (res.content ?? '').slice(0, 40),
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        error: redactSecrets(err instanceof Error ? err.message : String(err), secrets),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
