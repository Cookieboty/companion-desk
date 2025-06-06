import { AIModelConfig } from '../../types/config';

export interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  content: string;
  finished: boolean;
}

export abstract class BaseAIAdapter {
  protected config: AIModelConfig;

  constructor(config: AIModelConfig) {
    this.config = config;
  }

  // 普通对话
  abstract chat(request: ChatRequest): Promise<ChatResponse>;

  // 流式对话
  abstract streamChat(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;

  // 测试连接
  abstract testConnection(): Promise<boolean>;

  // 获取模型信息
  getModelInfo() {
    return {
      id: this.config.id,
      name: this.config.name,
      provider: this.config.provider,
      model: this.config.model
    };
  }

  // 验证配置
  protected validateConfig(): void {
    if (!this.config.apiUrl) {
      throw new Error('API URL is required');
    }
    if (!this.config.model) {
      throw new Error('Model name is required');
    }
  }

  // 构建请求头
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  // 处理错误
  protected handleError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.response.statusText;
      return new Error(`API Error (${status}): ${message}`);
    } else if (error.request) {
      return new Error('Network Error: Unable to reach the API server');
    } else {
      return new Error(`Request Error: ${error.message}`);
    }
  }
} 