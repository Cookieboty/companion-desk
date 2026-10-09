/**
 * Map `@ig-live/bundle-ig-base` ToolDefinition → Vercel AI SDK `tool()`.
 */
import type { ToolDefinition } from '@ig-live/bundle-ig-base';
import { jsonSchema, tool, type Tool } from 'ai';
import type { ZodType } from 'zod';

function toFlexibleSchema(input: unknown) {
  // ToolDefinition.input is a zod schema, AI SDK Schema (jsonSchema()), or raw JSON Schema.
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    if ('safeParse' in o || 'validate' in o || '~standard' in o) {
      return input as ZodType;
    }
    if ('type' in o || 'properties' in o || '$schema' in o) {
      return jsonSchema(input as never);
    }
  }
  return jsonSchema({
    type: 'object',
    additionalProperties: true,
  });
}

export function toAiSdkTool(def: ToolDefinition): Tool {
  return tool({
    description: def.description,
    inputSchema: toFlexibleSchema(def.input),
    execute: async (input, { abortSignal }) => def.execute(input, { signal: abortSignal }),
  });
}

export function toAiSdkToolSet(defs: ToolDefinition[]): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const def of defs) {
    out[def.name] = toAiSdkTool(def);
  }
  return out;
}
