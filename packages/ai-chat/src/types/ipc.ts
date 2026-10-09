import { type ChatMessage, type ChatConfig, type ChatSession } from './chat';
import { type AIModelConfig } from './config';

export interface IPCClient {
  // 消息相关：history 为本轮之前的会话消息，与本轮输入一起发给模型（多轮上下文）
  sendMessage(message: string, modelId?: string, history?: ChatMessage[]): Promise<string>;
  sendStreamMessage(
    message: string,
    modelId?: string,
    onChunk?: (chunk: string) => void,
    history?: ChatMessage[],
  ): Promise<void>;
  /** 当前会话的消息 */
  getChatHistory(): Promise<ChatMessage[]>;
  /** 清空当前会话 */
  clearChatHistory(): Promise<void>;
  saveMessage(message: ChatMessage): Promise<void>;

  // 会话相关
  listConversations(): Promise<Array<Omit<ChatSession, 'messages'>>>;
  newConversation(name?: string): Promise<string>;
  switchConversation(id: string): Promise<void>;

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
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  removeAllListeners: (channel: string) => void;
}
