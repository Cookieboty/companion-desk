/**
 * ChatFacade —— 消息发送 / 流式接收 / 中断 / 重生。
 *
 * P5 阶段做**薄封装**：
 * - `sendMessage` / `stream` 落在 LLM Provider 上（当前 provider 由 AppConfig 选出，
 *   在 P6 会由 runtime 补齐 systemPrompt / memory / tools 装配）。
 * - `abort` 通过 provider.abort(reqId) 转发；`regenerate` 生成新的 reqId 复用最近一次消息。
 *
 * 与 dsh 事件的关系：真实的 delta 由 dsh session 层驱动，本 Facade 只暴露 provider-level
 * 的低阶 chat/stream，供 UI 直接消费；`AIClient.on('message:delta')` 才是订阅入口。
 */

import {
  LLMRegistryKey,
  type ChatChunk,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
} from '@ig-live/bundle-ig-base';

import type { SdkContext } from '../di/SdkContext';
import { AIClientError, ErrorCodes } from '../errors';

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
}

export interface ChatFacade {
  sendMessage(opts: ChatStreamOptions): Promise<ChatResponse>;
  stream(opts: ChatStreamOptions): AsyncIterable<ChatChunk>;
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
    messages: opts.messages,
    temperature: opts.temperature,
    topP: opts.topP,
    maxTokens: opts.maxTokens,
    stream: false,
    signal: opts.signal,
    extra: opts.extra,
  });

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
