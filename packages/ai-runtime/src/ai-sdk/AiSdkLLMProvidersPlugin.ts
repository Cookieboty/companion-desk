/**
 * LLMProvidersPlugin variant that registers Vercel AI SDK-backed providers
 * for OpenAI-compatible endpoints (openai / deepseek / ollama / llamacpp /
 * qwen / doubao). Claude / Gemini stay as lightweight stubs from bundle-ig-base
 * until dedicated AI SDK adapters are wired.
 */
import {
  ClaudeProvider,
  GeminiProvider,
  LLMRegistryKey,
  definePlugin,
  type LLMProvider,
  type LLMProviderEntry,
  type LLMRegistry,
  type PluginContext,
} from '@ig-live/bundle-ig-base';

import { createAiSdkProviderFromEntry } from './AiSdkLlmProvider';

export interface AiSdkLLMProvidersConfig {
  providers: LLMProviderEntry[];
}

class InMemoryLLMRegistry implements LLMRegistry {
  private readonly map = new Map<string, LLMProvider>();
  register(provider: LLMProvider): void {
    this.map.set(provider.id, provider);
  }
  get(id: string): LLMProvider | undefined {
    return this.map.get(id);
  }
  list(): LLMProvider[] {
    return [...this.map.values()];
  }
}

const OPENAI_COMPAT_DEFAULTS: Record<
  string,
  { baseURL: string; model: string; requiresApiKey: boolean }
> = {
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    requiresApiKey: true,
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
  },
  ollama: {
    baseURL: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:3b-instruct',
    requiresApiKey: false,
  },
  llamacpp: {
    baseURL: 'http://127.0.0.1:8080/v1',
    model: 'local',
    requiresApiKey: false,
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    requiresApiKey: true,
  },
  doubao: {
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-pro',
    requiresApiKey: true,
  },
};

function createProvider(entry: LLMProviderEntry): LLMProvider {
  if (entry.id === 'claude') {
    return new ClaudeProvider({ apiKey: entry.apiKey, baseURL: entry.baseURL });
  }
  if (entry.id === 'gemini') {
    return new GeminiProvider({ apiKey: entry.apiKey, baseURL: entry.baseURL });
  }
  const d = OPENAI_COMPAT_DEFAULTS[entry.id] ?? {
    baseURL: entry.baseURL ?? 'http://127.0.0.1',
    model: 'default',
    requiresApiKey: Boolean(entry.apiKey),
  };
  return createAiSdkProviderFromEntry({
    id: entry.id,
    apiKey: entry.apiKey,
    baseURL: entry.baseURL ?? d.baseURL,
    model: entry.model ?? d.model,
  });
}

export const AiSdkLLMProvidersPlugin = definePlugin<AiSdkLLMProvidersConfig>({
  name: 'AiSdkLLMProvidersPlugin',
  apply(ctx: PluginContext, cfg: AiSdkLLMProvidersConfig) {
    const registry = new InMemoryLLMRegistry();
    ctx.provide(LLMRegistryKey, registry);
    for (const entry of cfg.providers ?? []) {
      try {
        registry.register(createProvider(entry));
      } catch (err) {
        ctx.logger.error(`register provider failed: ${entry.id}`, err);
      }
    }
    ctx.logger.info(
      `AI SDK LLM providers registered: ${registry
        .list()
        .map((p) => p.id)
        .join(', ')}`,
    );
  },
});
