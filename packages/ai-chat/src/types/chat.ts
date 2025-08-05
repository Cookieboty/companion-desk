export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelId?: string;
  error?: string;
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
} 