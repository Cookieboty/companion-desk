/**
 * 渲染进程侧的 provider 配置客户端：`ai:providers:*` IPC（经 preload 的 window.aiIPC）。
 *
 * 安全：主进程只回传掩码视图；明文 key 只在 upsert / addKey / rotateKey / testDraft
 * 的参数里单向发出，组件提交后立即清空输入框，不写 localStorage。
 */
export type Backend = 'openai-compatible' | 'anthropic' | 'google';
export type ProviderRole = 'chat' | 'agent-tools' | 'summary';

export interface ProviderPreset {
  id: string;
  name: string;
  backend: Backend;
  baseURL: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  websiteUrl?: string;
  apiKeyUrl?: string;
  envKey?: string;
  category: string;
}

export interface ProviderUsage {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastUsedAt?: number;
}

export interface KeyView {
  id: string;
  label?: string;
  masked: string;
  encryption: 'safeStorage' | 'none';
  createdAt: number;
  lastUsedAt?: number;
  lastError?: string;
}

export interface ProviderView {
  id: string;
  presetId: string;
  name: string;
  backend: Backend;
  baseURL: string;
  defaultModel: string;
  headers?: Record<string, string>;
  enabled: boolean;
  active: boolean;
  keys: KeyView[];
  usage: ProviderUsage;
  source: 'store';
}

export interface EnvProviderView {
  id: string;
  name: string;
  baseURL?: string;
  defaultModel?: string;
  hasKey: boolean;
  keyless?: boolean;
  active: boolean;
  usage: ProviderUsage;
  source: 'env';
}

export interface ProviderState {
  providers: ProviderView[];
  envProviders: EnvProviderView[];
  activeProviderId?: string;
  effectiveProviderId?: string;
  routes: Partial<Record<ProviderRole, { providerId: string; model?: string }>>;
  roles: ProviderRole[];
  encryption: 'safeStorage' | 'none';
  overrideId?: string;
}

export interface ProviderInput {
  id?: string;
  presetId?: string;
  name?: string;
  backend?: Backend;
  baseURL?: string;
  defaultModel?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  apiKey?: string;
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  error?: string;
  sample?: string;
}

interface AiBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, fn: (payload: unknown) => void) => () => void;
}

function bridge(): AiBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const b = (window as unknown as { aiIPC?: AiBridge }).aiIPC;
  return b && typeof b.invoke === 'function' ? b : undefined;
}

export const providerClientAvailable = (): boolean => Boolean(bridge());

const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
  const b = bridge();
  if (!b) throw new Error('window.aiIPC 不可用');
  try {
    return (await b.invoke(`ai:providers:${method}`, ...args)) as T;
  } catch (err) {
    // Electron 包装成 "Error invoking remote method 'x': Error: msg"
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')),
      { cause: err },
    );
  }
};

let lastState: ProviderState | undefined;
const remember = (s: ProviderState): ProviderState => {
  lastState = s;
  return s;
};

/** 当前生效 provider 的显示名（用于消息标签）；未知时 undefined。 */
export function effectiveProviderLabel(): string | undefined {
  const s = lastState;
  if (!s?.effectiveProviderId) return undefined;
  const id = s.effectiveProviderId;
  return (
    s.providers.find((p) => p.id === id)?.name ??
    s.envProviders.find((e) => e.id === id)?.name ??
    id
  );
}

export const providerClient = {
  presets: () => call<ProviderPreset[]>('presets'),
  state: () => call<ProviderState>('state').then(remember),
  upsert: (input: ProviderInput) => call<ProviderView>('upsert', input),
  remove: (id: string) => call<void>('remove', id),
  setActive: (id: string | null) => call<ProviderState>('setActive', id).then(remember),
  setRoute: (role: ProviderRole, binding: { providerId: string; model?: string } | null) =>
    call<ProviderState>('setRoute', role, binding),
  addKey: (id: string, key: string, label?: string) => call<ProviderView>('addKey', id, key, label),
  rotateKey: (id: string, keyId: string, key: string) =>
    call<ProviderView>('rotateKey', id, keyId, key),
  removeKey: (id: string, keyId: string) => call<ProviderView>('removeKey', id, keyId),
  promoteKey: (id: string, keyId: string) => call<ProviderView>('promoteKey', id, keyId),
  test: (id: string, keyId?: string) => call<TestResult>('test', id, keyId),
  testDraft: (input: ProviderInput) => call<TestResult>('testDraft', input),
  resetUsage: (id?: string) => call<void>('resetUsage', id),
  onChanged(fn: (s: ProviderState) => void): () => void {
    const b = bridge();
    if (!b) return () => undefined;
    return b.on('ai:providers:changed', (p) => fn(remember(p as ProviderState)));
  },
  onOpenPanel(fn: () => void): () => void {
    const b = bridge();
    if (!b) return () => undefined;
    return b.on('ai:providers:open-panel', () => fn());
  },
};

export const LOCAL_ONLY_NOTICE = '此 Token 仅保存在本地设备，不会上传或同步';

/** 所有可选 provider（面板 / 切换器共用）：store 中启用的 + 环境变量的 */
export function selectableProviders(
  s: ProviderState,
): Array<{ id: string; label: string; disabled: boolean }> {
  return [
    ...s.providers
      .filter((p) => p.enabled)
      .map((p) => ({ id: p.id, label: p.name, disabled: false })),
    ...s.envProviders.map((e) => ({
      id: e.id,
      label: `${e.name}（环境变量${e.hasKey ? '' : '，无 key'}）`,
      disabled: !e.hasKey,
    })),
  ];
}
