import { LLMRegistryKey, type LLMRegistry } from '../seams/llm';
import type { LLMProvider } from '../types/common';
import { definePlugin, type PluginContext } from '../types/dsh';

import {
  ClaudeProvider,
  DeepSeekProvider,
  DoubaoProvider,
  GeminiProvider,
  LlamaCppProvider,
  OllamaProvider,
  OpenAIProvider,
  QwenProvider,
} from './llm';

export type ProviderId =
  'openai' | 'deepseek' | 'ollama' | 'llamacpp' | 'claude' | 'gemini' | 'qwen' | 'doubao';

export interface LLMProviderEntry {
  id: ProviderId;
  apiKey?: string;
  baseURL?: string;
  extra?: Record<string, unknown>;
}

export interface LLMProvidersConfig {
  providers: LLMProviderEntry[];
}

/** 骨架期的内存实现；后续可迁到 dsh 官方 registry */
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

function createProvider(entry: LLMProviderEntry): LLMProvider {
  const shared = { apiKey: entry.apiKey, baseURL: entry.baseURL };
  switch (entry.id) {
    case 'openai':
      return new OpenAIProvider(shared);
    case 'deepseek':
      return new DeepSeekProvider(shared);
    case 'ollama':
      return new OllamaProvider(shared);
    case 'llamacpp':
      return new LlamaCppProvider(shared);
    case 'claude':
      return new ClaudeProvider(shared);
    case 'gemini':
      return new GeminiProvider(shared);
    case 'qwen':
      return new QwenProvider(shared);
    case 'doubao':
      return new DoubaoProvider(shared);
  }
}

export const LLMProvidersPlugin = definePlugin<LLMProvidersConfig>({
  name: 'LLMProvidersPlugin',
  apply(ctx: PluginContext, cfg: LLMProvidersConfig) {
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
      `LLM providers registered: ${registry
        .list()
        .map((p) => p.id)
        .join(', ')}`,
    );
  },
});
