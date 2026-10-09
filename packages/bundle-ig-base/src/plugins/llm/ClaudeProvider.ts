import type { ChatChunk, ChatRequest, ChatResponse, LLMProvider } from '../../types/common';

export interface ClaudeProviderOptions {
  apiKey?: string;
  baseURL?: string;
  version?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Claude / Anthropic 使用独立协议（Messages API），非 OpenAI 兼容。
 *
 * Legacy stub kept for classic LLMProvidersPlugin. Production uses AiSdkLlmProvider (anthropic backend).
 */
export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude';
  private readonly opts: ClaudeProviderOptions;
  private readonly aborts = new Map<string, AbortController>();

  constructor(opts: ClaudeProviderOptions = {}) {
    this.opts = {
      baseURL: 'https://api.anthropic.com/v1',
      version: '2023-06-01',
      ...opts,
    };
  }

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    throw new Error('[claude] chat() not implemented yet (P2-2 skeleton)');
  }

  // eslint-disable-next-line require-yield
  async *stream(_request: ChatRequest): AsyncIterable<ChatChunk> {
    throw new Error('[claude] stream() not implemented yet (P2-2 skeleton)');
  }

  abort(reqId: string): void {
    this.aborts.get(reqId)?.abort();
    this.aborts.delete(reqId);
  }
}
