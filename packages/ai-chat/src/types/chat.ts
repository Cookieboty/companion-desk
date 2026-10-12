export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelId?: string;
  error?: string;
  /** 知识库问答：本条回答引用的来源（[n] 对应 n） */
  sources?: Array<{
    n: number;
    docId: string;
    chunkId: string;
    path: string;
    title: string;
    page?: number;
    snippet: string;
  }>;
  /** 来自知识库问答 */
  kb?: boolean;
  /** 回答时参考了哪些长期记忆 */
  memories?: Array<{ id: string; kind: 'episode' | 'fact'; title: string }>;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  modelId?: string;
}

export interface StreamResponse {
  delta: string;
  finished: boolean;
}

export interface ChatConfig {
  theme: 'light' | 'dark';
  language: 'zh-CN' | 'en-US';
  fontSize: number;
  autoSave: boolean;
  maxHistoryLength: number;
  /** 发送给模型的 system prompt（每次请求都会带上，不参与历史裁剪） */
  systemPrompt?: string;
}
