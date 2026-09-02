import type {
  ConfigMigrationResult,
  DshProviderPatch,
  LegacyAIModelConfig,
  LegacyAppConfig,
} from './types';

const ALLOWED_PROVIDERS = new Set(['deepseek', 'openai', 'claude', 'ollama', 'custom']);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function keyRefFor(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_.-]/g, '_');
  return `provider.${safe}.apiKey`;
}

function toProviderPatch(model: LegacyAIModelConfig): DshProviderPatch {
  const patch: DshProviderPatch = {
    id: model.id,
    displayName: model.name,
    provider: model.provider,
    baseUrl: model.apiUrl,
    model: model.model,
    enabled: model.enabled,
    isLocal: model.isLocal === true,
  };
  if (isFiniteNumber(model.maxTokens)) patch.maxTokens = model.maxTokens;
  if (isFiniteNumber(model.temperature)) patch.temperature = model.temperature;
  if (isNonEmptyString(model.apiKey)) patch.keyRef = keyRefFor(model.id);
  return patch;
}

function validateModel(
  model: unknown,
  index: number,
): { ok: true; value: LegacyAIModelConfig } | { ok: false; id: string; reason: string } {
  if (!model || typeof model !== 'object') {
    return { ok: false, id: `<index:${index}>`, reason: 'not an object' };
  }
  const raw = model as Record<string, unknown>;
  const id = isNonEmptyString(raw.id) ? raw.id : `<index:${index}>`;
  if (!isNonEmptyString(raw.id)) return { ok: false, id, reason: 'missing id' };
  if (!isNonEmptyString(raw.name)) return { ok: false, id, reason: 'missing name' };
  if (typeof raw.provider !== 'string' || !ALLOWED_PROVIDERS.has(raw.provider)) {
    return { ok: false, id, reason: `invalid provider "${String(raw.provider)}"` };
  }
  if (!isNonEmptyString(raw.apiUrl)) return { ok: false, id, reason: 'missing apiUrl' };
  if (!isNonEmptyString(raw.model)) return { ok: false, id, reason: 'missing model' };
  if (typeof raw.enabled !== 'boolean') {
    return { ok: false, id, reason: 'missing enabled flag' };
  }
  return { ok: true, value: raw as unknown as LegacyAIModelConfig };
}

/**
 * 将旧的 AIModelConfig[] 转换为 dsh profile 中 llm.providers[] 的补丁数据。
 *
 * - 具备 apiKey 的条目会产出一条 keyEntry；调用方需通过 SafeKeyProvider 将其
 *   加密写入 <userData>/keys/<keyRef>.bin。
 * - 校验失败的条目通过 `skipped` 返回，不会抛异常，方便脚本一次性输出全部问题。
 */
export function migrateLegacyConfig(config: LegacyAppConfig): ConfigMigrationResult {
  const providers: DshProviderPatch[] = [];
  const keyEntries: ConfigMigrationResult['keyEntries'] = [];
  const skipped: ConfigMigrationResult['skipped'] = [];

  const models = Array.isArray(config.models) ? config.models : [];
  const seen = new Set<string>();
  models.forEach((rawModel, index) => {
    const result = validateModel(rawModel, index);
    if (!result.ok) {
      skipped.push({ id: result.id, reason: result.reason });
      return;
    }
    const model = result.value;
    if (seen.has(model.id)) {
      skipped.push({ id: model.id, reason: 'duplicate id' });
      return;
    }
    seen.add(model.id);

    const patch = toProviderPatch(model);
    providers.push(patch);
    if (patch.keyRef && model.apiKey) {
      keyEntries.push({ keyRef: patch.keyRef, secret: model.apiKey });
    }
  });

  const defaultProviderId =
    isNonEmptyString(config.currentModelId) && seen.has(config.currentModelId)
      ? config.currentModelId
      : providers.find((p) => p.enabled)?.id;

  return { providers, defaultProviderId, keyEntries, skipped };
}
