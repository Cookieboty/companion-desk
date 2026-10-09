/**
 * ChatFacade —— 消息发送 / 流式接收 / 中断 / 重生 / 可选 tool agent 循环。
 *
 * - `sendMessage` / `stream` 落在 LLM Provider 上（由 IgPluginHost 注入的 registry 选出）。
 * - `agent` / `agentStream`：当 provider 暴露 `withTools`（Vercel AI SDK 后端）时，
 *   把 ToolRegistry 中的工具交给 AI SDK `stopWhen: stepCountIs` 循环；否则退化为
 *   单次 stream/chat（保持 IPC 契约稳定）。
 */

import {
  LLMRegistryKey,
  ToolRegistryKey,
  type ChatChunk,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  type ToolDefinition,
} from '@ig-live/bundle-ig-base';

import type { SdkContext } from '../di/SdkContext';
import { AIClientError, ErrorCodes } from '../errors';

import { fitMessagesToBudget, type ContextBudget } from './chatContext';

export interface ChatStreamOptions {
  reqId?: string;
  provider?: string;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  extra?: Record<string, unknown>;
  /**
   * 多轮上下文预算：`messages` 为完整对话（含 system），发送前按预算裁剪；
   * 传 `false` 关闭裁剪。默认 [DEFAULT_CONTEXT_BUDGET](./chatContext.ts)。
   */
  context?: ContextBudget | false;
  /** Agent loop max steps when using AI SDK tools (default 5). */
  maxSteps?: number;
}

interface WithTools {
  withTools(defs: ToolDefinition[]): {
    chat: (req: ChatRequest) => Promise<ChatResponse>;
    stream: (req: ChatRequest) => AsyncIterable<ChatChunk>;
  };
}

function hasWithTools(p: LLMProvider): p is LLMProvider & WithTools {
  return typeof (p as unknown as WithTools).withTools === 'function';
}

export interface ChatFacade {
  sendMessage(opts: ChatStreamOptions): Promise<ChatResponse>;
  stream(opts: ChatStreamOptions): AsyncIterable<ChatChunk>;
  /** Single-turn or multi-step tool agent (AI SDK when available). */
  agent(opts: ChatStreamOptions): Promise<ChatResponse>;
  agentStream(opts: ChatStreamOptions): AsyncIterable<ChatChunk>;
  abort(reqId: string): void;
  regenerate(opts: ChatStreamOptions): AsyncIterable<ChatChunk>;
}

export function createChatFacade(ctx: SdkContext): ChatFacade {
  const pickProvider = (id?: string): LLMProvider => {
    const reg = ctx.inject(LLMRegistryKey);
    if (!reg) {
      throw new AIClientError(
        ErrorCodes.SEAM_NOT_INJECTED,
        'ctx.llm 未注入；请确认已加载 bundle-ig-base',
      );
    }
    const providers = reg.list();
    if (id) {
      const found = reg.get(id);
      if (!found) {
        throw new AIClientError(ErrorCodes.SEAM_NOT_INJECTED, `LLM provider '${id}' 未注册`);
      }
      return found;
    }
    if (providers.length === 0) {
      throw new AIClientError(ErrorCodes.SEAM_NOT_INJECTED, '没有可用的 LLM provider');
    }
    return providers[0]!;
  };

  const buildRequest = (opts: ChatStreamOptions, provider: LLMProvider): ChatRequest => ({
    reqId: opts.reqId ?? cryptoRandomId(),
    provider: provider.id,
    model: opts.model ?? 'default',
    messages:
      opts.context === false ? opts.messages : fitMessagesToBudget(opts.messages, opts.context),
    temperature: opts.temperature,
    topP: opts.topP,
    maxTokens: opts.maxTokens,
    stream: false,
    signal: opts.signal,
    extra: opts.extra,
  });

  const listTools = (): ToolDefinition[] => {
    const reg = ctx.inject(ToolRegistryKey);
    return reg ? (reg.list() as ToolDefinition[]) : [];
  };

  const runAgent = (opts: ChatStreamOptions) => {
    const provider = pickProvider(opts.provider);
    const tools = listTools();
    if (hasWithTools(provider) && tools.length > 0) {
      return provider.withTools(tools);
    }
    return provider;
  };

  return {
    async sendMessage(opts) {
      const provider = pickProvider(opts.provider);
      const req = buildRequest(opts, provider);
      return provider.chat(req);
    },
    stream(opts) {
      const provider = pickProvider(opts.provider);
      const req = { ...buildRequest(opts, provider), stream: true };
      return provider.stream(req);
    },
    async agent(opts) {
      const runner = runAgent(opts);
      const provider = pickProvider(opts.provider);
      const req = buildRequest(opts, provider);
      return runner.chat(req);
    },
    agentStream(opts) {
      const runner = runAgent(opts);
      const provider = pickProvider(opts.provider);
      const req = { ...buildRequest(opts, provider), stream: true };
      return runner.stream(req);
    },
    abort(reqId) {
      const reg = ctx.inject(LLMRegistryKey);
      if (!reg) return;
      for (const p of reg.list()) p.abort(reqId);
    },
    regenerate(opts) {
      const provider = pickProvider(opts.provider);
      const req = {
        ...buildRequest(opts, provider),
        reqId: cryptoRandomId(),
        stream: true,
      };
      return provider.stream(req);
    },
  };
}

function cryptoRandomId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
