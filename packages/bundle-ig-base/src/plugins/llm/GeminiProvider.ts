import type { ChatChunk, ChatRequest, ChatResponse, LLMProvider } from '../../types/common';

export interface GeminiProviderOptions {
  apiKey?: string;
  baseURL?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Google Gemini (generativelanguage.googleapis.com) 使用独立协议。
 *
 * 骨架版：TODO(P2-2) 实现 generateContent + streamGenerateContent + function calling 映射。
 */
export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';
  private readonly opts: GeminiProviderOptions;
  private readonly aborts = new Map<string, AbortController>();

  constructor(opts: GeminiProviderOptions = {}) {
    this.opts = {
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      ...opts,
    };
  }

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    throw new Error('[gemini] chat() not implemented yet (P2-2 skeleton)');
  }

  // eslint-disable-next-line require-yield
  async *stream(_request: ChatRequest): AsyncIterable<ChatChunk> {
    throw new Error('[gemini] stream() not implemented yet (P2-2 skeleton)');
  }

  abort(reqId: string): void {
    this.aborts.get(reqId)?.abort();
    this.aborts.delete(reqId);
  }
}
