import type { ToolDefinition } from '../types/common';
import { defineService } from '../types/dsh';

export interface ToolRegistry {
  register<TInput = unknown, TOutput = unknown>(tool: ToolDefinition<TInput, TOutput>): void;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
}

export const ToolRegistryKey = defineService<ToolRegistry>('ctx.tools');
