import { IPCClient, ElectronAPI } from '../types/ipc';
import { ChatMessage, ChatConfig } from '../types/chat';
import { AIModelConfig } from '../types/config';

// 声明全局window对象的electronAPI
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// Electron IPC实现
export class ElectronIPC implements IPCClient {
  private ipcRenderer: ElectronAPI;

  constructor() {
    this.ipcRenderer = window.electronAPI!;
    if (!this.ipcRenderer) {
      throw new Error('Electron IPC not available');
    }
  }

  // 消息相关方法 - 使用命名空间规范
  async sendMessage(message: string, modelId?: string): Promise<string> {
    try {
      return await this.ipcRenderer.invoke('ai-chat:message:send', { message, modelId });
    } catch (error: any) {
      throw new Error(`发送消息失败: ${error.message}`);
    }
  }

  async sendStreamMessage(
    message: string,
    modelId?: string,
    onChunk?: (chunk: string) => void
  ): Promise<void> {
    try {
      // 注册流式消息监听
      const cleanup = this.ipcRenderer.on('ai-chat:message:chunk', (_event: any, chunk: string) => {
        onChunk?.(chunk);
      });

      await this.ipcRenderer.invoke('ai-chat:message:stream', { message, modelId });

      // 清理监听器
      setTimeout(() => cleanup(), 100);
    } catch (error: any) {
      throw new Error(`发送流式消息失败: ${error.message}`);
    }
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    return this.ipcRenderer.invoke('ai-chat:message:getHistory');
  }

  async clearChatHistory(): Promise<void> {
    return this.ipcRenderer.invoke('ai-chat:message:clearHistory');
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    return this.ipcRenderer.invoke('ai-chat:message:save', message);
  }

  // 配置相关方法
  async getConfig(): Promise<ChatConfig> {
    return this.ipcRenderer.invoke('ai-chat:config:get');
  }

  async updateConfig(config: Partial<ChatConfig>): Promise<void> {
    return this.ipcRenderer.invoke('ai-chat:config:update', config);
  }

  // 模型相关方法
  async getAvailableModels(): Promise<AIModelConfig[]> {
    return this.ipcRenderer.invoke('ai-chat:model:getAvailable');
  }

  async addModel(model: AIModelConfig): Promise<void> {
    return this.ipcRenderer.invoke('ai-chat:model:add', model);
  }

  async removeModel(modelId: string): Promise<void> {
    return this.ipcRenderer.invoke('ai-chat:model:remove', modelId);
  }

  async updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void> {
    return this.ipcRenderer.invoke('ai-chat:model:update', modelId, updates);
  }

  async testModelConnection(modelId: string): Promise<boolean> {
    return this.ipcRenderer.invoke('ai-chat:model:testConnection', modelId);
  }
}

// 开发环境模拟实现
export class MockIPCClient implements IPCClient {
  async sendMessage(message: string, modelId?: string): Promise<string> {
    console.log('[Mock] Send message:', message, 'to model:', modelId);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟延迟
    return `模拟回复: ${message}`;
  }

  async sendStreamMessage(message: string, modelId?: string, onChunk?: (chunk: string) => void): Promise<void> {
    console.log('[Mock] Send stream message:', message);
    // 模拟流式响应
    const chunks = ['模拟', '流式', '回复', '内容'];
    for (const chunk of chunks) {
      setTimeout(() => onChunk?.(chunk + ' '), chunks.indexOf(chunk) * 500);
    }
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    return [
      {
        id: '1',
        role: 'user',
        content: '你好',
        timestamp: Date.now() - 60000
      },
      {
        id: '2',
        role: 'assistant',
        content: '你好！有什么可以帮助你的吗？',
        timestamp: Date.now() - 50000
      }
    ];
  }

  async clearChatHistory(): Promise<void> {
    console.log('[Mock] Clear chat history');
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    console.log('[Mock] Save message:', message);
  }

  async getConfig(): Promise<ChatConfig> {
    return {
      theme: 'light',
      language: 'zh-CN',
      fontSize: 14,
      autoSave: true,
      maxHistoryLength: 1000
    };
  }

  async updateConfig(config: Partial<ChatConfig>): Promise<void> {
    console.log('[Mock] Update config:', config);
  }

  async getAvailableModels(): Promise<AIModelConfig[]> {
    return [
      {
        id: 'deepseek',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        apiUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        enabled: true
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        apiUrl: 'https://api.openai.com',
        model: 'gpt-4',
        enabled: true
      }
    ];
  }

  async addModel(model: AIModelConfig): Promise<void> {
    console.log('[Mock] Add model:', model);
  }

  async removeModel(modelId: string): Promise<void> {
    console.log('[Mock] Remove model:', modelId);
  }

  async updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void> {
    console.log('[Mock] Update model:', modelId, updates);
  }

  async testModelConnection(modelId: string): Promise<boolean> {
    console.log('[Mock] Test model connection:', modelId);
    return true;
  }
}

// 工厂函数 - 根据环境创建合适的客户端
export const createIPCClient = (): IPCClient => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return new ElectronIPC();
  } else {
    console.warn('Electron环境不可用，使用Mock客户端');
    return new MockIPCClient();
  }
}; 