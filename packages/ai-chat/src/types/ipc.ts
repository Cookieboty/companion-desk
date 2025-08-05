import { ChatMessage, ChatConfig } from './chat';
import { AIModelConfig } from './config';

export interface IPCClient {
  // 消息相关
  sendMessage(message: string, modelId?: string): Promise<string>;
  sendStreamMessage(message: string, modelId?: string, onChunk?: (chunk: string) => void): Promise<void>;
  getChatHistory(): Promise<ChatMessage[]>;
  clearChatHistory(): Promise<void>;
  saveMessage(message: ChatMessage): Promise<void>;

  // 配置相关
  getConfig(): Promise<ChatConfig>;
  updateConfig(config: Partial<ChatConfig>): Promise<void>;

  // 模型相关
  getAvailableModels(): Promise<AIModelConfig[]>;
  addModel(model: AIModelConfig): Promise<void>;
  removeModel(modelId: string): Promise<void>;
  updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void>;
  testModelConnection(modelId: string): Promise<boolean>;
}

export interface ElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, callback: Function) => () => void;
  removeAllListeners: (channel: string) => void;
} 