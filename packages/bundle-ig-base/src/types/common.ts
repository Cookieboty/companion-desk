// 跨环境通用的公共类型：LLM / Tools / Memory
// 仅本 bundle 内部使用；后续可迁移到 @ig-live/ai-sdk 的 dto。

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ChatRequest {
  reqId: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: Array<{ name: string; description: string; parametersJsonSchema: unknown }>;
  signal?: AbortSignal;
  extra?: Record<string, unknown>;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  reqId: string;
  provider: string;
  model: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage?: ChatUsage;
  raw?: unknown;
}

export type ChatChunk =
  | { type: 'delta'; content: string }
  | { type: 'tool_call.delta'; index: number; name?: string; argumentsJson?: string }
  | { type: 'usage'; usage: ChatUsage }
  | { type: 'done'; finishReason: ChatResponse['finishReason'] }
  | { type: 'error'; error: string };

/** 每个 provider 必须实现的最小接口 */
export interface LLMProvider {
  readonly id: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
  abort(reqId: string): void;
}

/** 工具接口 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** zod schema */
  input: unknown;
  /** 是否属于"破坏性"工具（需 UI 确认） */
  dangerous?: boolean;
  execute: (input: TInput, ctx: { signal?: AbortSignal }) => Promise<TOutput>;
}

/** 记忆 - 长期 facts / 摘要 / 用户偏好 */
export interface MemoryFact {
  id: string;
  content: string;
  source: 'user' | 'inferred' | 'system';
  createdAt: number;
  score?: number;
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  updatedAt: number;
  stepCount: number;
}
