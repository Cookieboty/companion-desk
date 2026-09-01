import type { LLMProvider } from '../types/common';
import { defineService } from '../types/dsh';

export interface LLMRegistry {
  register(provider: LLMProvider): void;
  get(id: string): LLMProvider | undefined;
  list(): LLMProvider[];
}

export const LLMRegistryKey = defineService<LLMRegistry>('ctx.llm');
