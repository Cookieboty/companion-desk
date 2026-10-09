/**
 * LLMProvider backed by Vercel AI SDK (`generateText` / `streamText`).
 *
 * Keeps the existing ChatFacade / IPC surface: chat() and stream() still speak
 * bundle-ig-base ChatRequest / ChatChunk. Tool loops use `stopWhen: stepCountIs`.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatUsage,
  LLMProvider,
  ToolDefinition,
} from '@ig-live/bundle-ig-base';
import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';

import { toAiSdkToolSet } from './mapTools';

export interface AiSdkLlmProviderOptions {
  id: string;
  baseURL: string;
  apiKey?: string;
  defaultModel?: string;
  requiresApiKey?: boolean;
  /** Max agent loop steps when tools are attached (default 5). */
  maxSteps?: number;
  fetchImpl?: typeof fetch;
}

/** AI SDK 7+ rejects role:system in `messages`; fold them into `instructions`. */
function splitPrompt(messages: ChatMessage[]): {
  instructions: string | undefined;
  messages: ModelMessage[];
} {
  const systems: string[] = [];
  const rest: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systems.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      rest.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: m.toolCallId ?? 'unknown',
            toolName: m.name ?? 'tool',
            output: { type: 'text', value: m.content },
          },
        ],
      });
      continue;
    }
    if (m.role === 'assistant') {
      rest.push({ role: 'assistant', content: m.content });
      continue;
    }
    rest.push({ role: 'user', content: m.content });
  }
  return {
    instructions: systems.length > 0 ? systems.join('\n\n') : undefined,
    messages: rest,
  };
}

function usageOf(
  u: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined,
): ChatUsage | undefined {
  if (!u) return undefined;
  const promptTokens = u.inputTokens ?? 0;
  const completionTokens = u.outputTokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: u.totalTokens ?? promptTokens + completionTokens,
  };
}

function finishOf(raw: string | undefined): ChatResponse['finishReason'] {
  switch (raw) {
    case 'length':
    case 'content-filter':
      return raw === 'content-filter' ? 'content_filter' : 'length';
    case 'tool-calls':
      return 'tool_calls';
    case 'error':
      return 'error';
    default:
      return 'stop';
  }
}

export class AiSdkLlmProvider implements LLMProvider {
  readonly id: string;
  private readonly opts: AiSdkLlmProviderOptions;
  private readonly aborts = new Map<string, AbortController>();
  private readonly modelFactory: (modelId: string) => LanguageModel;

  constructor(opts: AiSdkLlmProviderOptions) {
    this.id = opts.id;
    this.opts = opts;
    const provider = createOpenAICompatible({
      name: opts.id,
      baseURL: opts.baseURL.replace(/\/$/, ''),
      apiKey: opts.apiKey,
      fetch: opts.fetchImpl as never,
      includeUsage: true,
    });
    this.modelFactory = (modelId) => provider.chatModel(modelId);
  }

  /** Attach ToolDefinitions for a single request (agent loop). */
  withTools(defs: ToolDefinition[]): { chat: LLMProvider['chat']; stream: LLMProvider['stream'] } {
    const tools = toAiSdkToolSet(defs) as ToolSet;
    return {
      chat: (req) => this.runChat(req, tools),
      stream: (req) => this.runStream(req, tools),
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.runChat(request);
  }

  stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    return this.runStream(request);
  }

  abort(reqId: string): void {
    this.aborts.get(reqId)?.abort();
    this.aborts.delete(reqId);
  }

  private resolveModel(request: ChatRequest): string {
    if (request.model && request.model !== 'default') return request.model;
    return this.opts.defaultModel ?? 'default';
  }

  private assertKey(): void {
    if (this.opts.requiresApiKey !== false && !this.opts.apiKey?.trim()) {
      throw new Error(`[${this.id}] API key is not configured`);
    }
  }

  private bindAbort(request: ChatRequest): AbortSignal | undefined {
    const local = new AbortController();
    this.aborts.set(request.reqId, local);
    if (request.signal) {
      if (request.signal.aborted) local.abort();
      else request.signal.addEventListener('abort', () => local.abort(), { once: true });
    }
    return local.signal;
  }

  private async runChat(request: ChatRequest, tools?: ToolSet): Promise<ChatResponse> {
    this.assertKey();
    const signal = this.bindAbort(request);
    try {
      const prompt = splitPrompt(request.messages);
      const result = await generateText({
        model: this.modelFactory(this.resolveModel(request)),
        ...(prompt.instructions ? { instructions: prompt.instructions } : {}),
        messages: prompt.messages,
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxTokens,
        abortSignal: signal,
        ...(tools ? { tools, stopWhen: stepCountIs(this.opts.maxSteps ?? 5) } : {}),
      });
      const toolCalls =
        result.toolCalls?.length > 0
          ? result.toolCalls.map((t) => ({
              id: t.toolCallId,
              name: t.toolName,
              argumentsJson: JSON.stringify(t.input ?? {}),
            }))
          : undefined;
      return {
        reqId: request.reqId,
        provider: this.id,
        model: this.resolveModel(request),
        content: result.text,
        toolCalls,
        finishReason: finishOf(result.finishReason),
        usage: usageOf(result.usage),
      };
    } finally {
      this.aborts.delete(request.reqId);
    }
  }

  private async *runStream(request: ChatRequest, tools?: ToolSet): AsyncIterable<ChatChunk> {
    this.assertKey();
    const signal = this.bindAbort(request);
    try {
      const prompt = splitPrompt(request.messages);
      const result = streamText({
        model: this.modelFactory(this.resolveModel(request)),
        ...(prompt.instructions ? { instructions: prompt.instructions } : {}),
        messages: prompt.messages,
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxTokens,
        abortSignal: signal,
        ...(tools ? { tools, stopWhen: stepCountIs(this.opts.maxSteps ?? 5) } : {}),
      });
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          yield { type: 'delta', content: part.text };
        } else if (part.type === 'tool-call') {
          yield {
            type: 'tool_call.delta',
            index: 0,
            name: part.toolName,
            argumentsJson: JSON.stringify(part.input ?? {}),
          };
        } else if (part.type === 'finish') {
          const u = usageOf(part.totalUsage);
          if (u) yield { type: 'usage', usage: u };
          yield { type: 'done', finishReason: finishOf(part.finishReason) };
        } else if (part.type === 'error') {
          yield {
            type: 'error',
            error: part.error instanceof Error ? part.error.message : String(part.error),
          };
        }
      }
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
    } finally {
      this.aborts.delete(request.reqId);
    }
  }
}

export function createAiSdkProviderFromEntry(entry: {
  id: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}): AiSdkLlmProvider {
  const defaults: Record<string, { baseURL: string; model: string; requiresApiKey: boolean }> = {
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
  };
  const d = defaults[entry.id] ?? {
    baseURL: entry.baseURL ?? 'http://127.0.0.1',
    model: 'default',
    requiresApiKey: Boolean(entry.apiKey),
  };
  return new AiSdkLlmProvider({
    id: entry.id,
    apiKey: entry.apiKey,
    baseURL: entry.baseURL ?? d.baseURL,
    defaultModel: entry.model ?? d.model,
    requiresApiKey: d.requiresApiKey,
  });
}
