import { type ChatMessage, type ChatConfig, type ChatSession } from './chat';
import { type AIModelConfig } from './config';

export interface IPCClient {
  // 消息相关：history 为本轮之前的会话消息，与本轮输入一起发给模型（多轮上下文）
  sendMessage(
    message: string,
    modelId?: string,
    history?: ChatMessage[],
    extraSystem?: string,
  ): Promise<string>;
  /** extraSystem：追加在 system prompt 后的上下文（长期记忆召回等） */
  sendStreamMessage(
    message: string,
    modelId?: string,
    onChunk?: (chunk: string) => void,
    history?: ChatMessage[],
    extraSystem?: string,
    /** 本轮附带的图片（base64） */
    images?: Array<{ mime: string; data: string }>,
  ): Promise<void>;
  /** 当前会话 id（长期记忆按会话摘要） */
  currentConversationId?(): string | undefined;
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

export interface UpdateStateView {
  status: string;
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string | null;
  releaseNotes?: string | null;
  percent?: number;
  error?: string;
  checkedAt?: number;
  autoCheck: boolean;
}

export interface ElectronAPI {
  updates?: {
    get: () => Promise<UpdateStateView>;
    check: () => Promise<UpdateStateView>;
    download: () => Promise<UpdateStateView>;
    install: () => Promise<UpdateStateView>;
    setAutoCheck: (on: boolean) => Promise<UpdateStateView>;
    onChanged: (cb: (s: UpdateStateView) => void) => () => void;
  };
}
