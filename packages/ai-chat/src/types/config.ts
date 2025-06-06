export interface AIModelConfig {
  id: string;
  name: string;
  provider: 'deepseek' | 'openai' | 'claude' | 'ollama' | 'custom';
  apiKey?: string;
  apiUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
  isLocal?: boolean;
}

export interface AppConfig {
  chat: {
    theme: 'light' | 'dark';
    language: 'zh-CN' | 'en-US';
    fontSize: number;
    autoSave: boolean;
    maxHistoryLength: number;
  };
  models: AIModelConfig[];
  currentModelId?: string;
} 