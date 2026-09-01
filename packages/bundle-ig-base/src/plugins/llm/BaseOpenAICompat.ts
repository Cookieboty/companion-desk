import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ChatUsage,
  LLMProvider,
} from '../../types/common';

export interface OpenAICompatOptions {
  id: string;
  baseURL: string;
  apiKey?: string;
  defaultHeaders?: Record<string, string>;
  /** 由 provider 覆盖以做请求/响应差异适配 */
  buildBody?: (req: ChatRequest) => Record<string, unknown>;
  parseChunk?: (raw: unknown) => ChatChunk | ChatChunk[] | undefined;
  parseResponse?: (raw: unknown, req: ChatRequest) => ChatResponse;
  fetchImpl?: typeof fetch;
}

/**
 * OpenAI 兼容层 —— 归一 SSE 流式解析、tool_call 结构映射、usage 归一。
 *
 * 骨架版：只保留公开签名与最小 fetch 骨架，具体请求/解析逻辑留 TODO(P2-2)。
 */
export abstract class BaseOpenAICompat implements LLMProvider {
  readonly id: string;
  protected readonly opts: OpenAICompatOptions;
  protected readonly aborts = new Map<string, AbortController>();

  constructor(opts: OpenAICompatOptions) {
    this.id = opts.id;
    this.opts = opts;
  }

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    // TODO(P2-2): 走 POST ${baseURL}/chat/completions，解析非流响应
    throw new Error(`[${this.id}] chat() not implemented yet (P2-2 skeleton)`);
  }

  // eslint-disable-next-line require-yield
  async *stream(_request: ChatRequest): AsyncIterable<ChatChunk> {
    // TODO(P2-2): SSE 流式，返回 delta / tool_call.delta / usage / done
    throw new Error(`[${this.id}] stream() not implemented yet (P2-2 skeleton)`);
  }

  abort(reqId: string): void {
    this.aborts.get(reqId)?.abort();
    this.aborts.delete(reqId);
  }

  /** 归一 usage —— 各家字段命名不同 */
  protected normalizeUsage(raw: unknown): ChatUsage | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, number>;
    const promptTokens = r.prompt_tokens ?? r.input_tokens ?? r.promptTokens ?? 0;
    const completionTokens = r.completion_tokens ?? r.output_tokens ?? r.completionTokens ?? 0;
    return {
      promptTokens,
      completionTokens,
      totalTokens: r.total_tokens ?? promptTokens + completionTokens,
    };
  }
}
