/**
 * Registers Vercel AI SDK-backed LLM providers (OpenAI-compatible + Anthropic + Google).
 */
import {
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

export const AiSdkLLMProvidersPlugin = definePlugin<AiSdkLLMProvidersConfig>({
  name: 'AiSdkLLMProvidersPlugin',
  apply(ctx: PluginContext, cfg: AiSdkLLMProvidersConfig) {
    const registry = new InMemoryLLMRegistry();
    ctx.provide(LLMRegistryKey, registry);
    for (const entry of cfg.providers ?? []) {
      try {
        registry.register(createAiSdkProviderFromEntry(entry));
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
