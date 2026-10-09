import { ClientAIClient } from '@ig-live/ai-sdk-client';

import { type ChatMessage, type ChatConfig, type ChatSession } from '../types/chat';
import { type AIModelConfig } from '../types/config';
import { type IPCClient, type ElectronAPI } from '../types/ipc';

import { ConversationStore } from './conversationStore';
import { buildProviderMessages } from './history';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    aiIPC?: unknown;
  }
}

const LOCAL_CONFIG_KEY = 'ai-chat:config';
const LOCAL_MODELS_KEY = 'ai-chat:models';
const LOCAL_CURRENT_MODEL_KEY = 'ai-chat:currentModel';

type SdkChatFacade = {
  sendMessage: (opts: SdkChatOptions) => Promise<{ content?: string } & Record<string, unknown>>;
  stream: (opts: SdkChatOptions) => AsyncIterable<SdkChatChunk>;
  abort: (reqId: string) => void;
};

interface SdkChatOptions {
  reqId?: string;
  provider?: string;
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
}

type SdkChatChunk =
  | { type: 'delta'; content: string }
  | { type: 'done'; finishReason?: string }
  | { type: 'error'; error: string }
  | { type: string; [k: string]: unknown };

type SdkUserProfileFacade = {
  get: () => Record<string, unknown> | undefined;
  set: (input: { patch: Record<string, unknown>; source?: string }) => Promise<unknown>;
};

const readStorage = <T>(key: string): T | undefined => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const writeStorage = (key: string, value: unknown): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

const DEFAULT_CONFIG: ChatConfig = {
  theme: 'light',
  language: 'zh-CN',
  fontSize: 14,
  autoSave: true,
  maxHistoryLength: 1000,
  systemPrompt:
    '你是 Companion Desk，一个运行在用户电脑上的本地 AI 助手。请结合之前的对话内容，简洁、准确地回答。',
};

const DEFAULT_MODELS: AIModelConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    apiUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai',
    apiUrl: 'https://api.openai.com',
    model: 'gpt-4o-mini',
    enabled: true,
  },
  {
    id: 'claude',
    name: 'Claude',
    provider: 'claude',
    apiUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    enabled: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'gemini',
    apiUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    enabled: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    provider: 'ollama',
    apiUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5:3b-instruct',
    enabled: true,
    isLocal: true,
  },
];

export class SdkIPCClient implements IPCClient {
  private readonly client: ClientAIClient;
  private readonly owned: boolean;
  private readonly store = new ConversationStore();

  constructor(client?: ClientAIClient) {
    if (client) {
      this.client = client;
      this.owned = false;
    } else {
      this.client = new ClientAIClient();
      this.owned = true;
    }
  }

  async dispose(): Promise<void> {
    if (this.owned) await this.client.dispose();
  }

  private get chat(): SdkChatFacade {
    return this.client.chat as unknown as SdkChatFacade;
  }

  private get userProfile(): SdkUserProfileFacade {
    return this.client.memory.userProfile as unknown as SdkUserProfileFacade;
  }

  private currentModelId(fallback?: string): string | undefined {
    return fallback ?? readStorage<string>(LOCAL_CURRENT_MODEL_KEY);
  }

  private async buildMessages(message: string, history: ChatMessage[] = []) {
    const { systemPrompt } = await this.getConfig();
    return buildProviderMessages(history, message, systemPrompt);
  }

  async sendMessage(message: string, modelId?: string, history?: ChatMessage[]): Promise<string> {
    try {
      const resp = await this.chat.sendMessage({
        provider: this.currentModelId(modelId),
        messages: await this.buildMessages(message, history),
      });
      return typeof resp?.content === 'string' ? resp.content : '';
    } catch (error) {
      throw new Error(`发送消息失败: ${(error as Error).message ?? String(error)}`, {
        cause: error,
      });
    }
  }

  async sendStreamMessage(
    message: string,
    modelId?: string,
    onChunk?: (chunk: string) => void,
    history?: ChatMessage[],
  ): Promise<void> {
    try {
      const iterable = this.chat.stream({
        provider: this.currentModelId(modelId),
        messages: await this.buildMessages(message, history),
      });
      for await (const chunk of iterable) {
        if (!chunk || typeof chunk !== 'object') continue;
        const c = chunk as SdkChatChunk;
        if (c.type === 'delta' && typeof (c as { content?: string }).content === 'string') {
          onChunk?.((c as { content: string }).content);
        } else if (c.type === 'error') {
          throw new Error((c as { error: string }).error);
        }
      }
    } catch (error) {
      throw new Error(`发送流式消息失败: ${(error as Error).message ?? String(error)}`, {
        cause: error,
      });
    }
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    return this.store.getMessages();
  }

  async clearChatHistory(): Promise<void> {
    this.store.clear();
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    this.store.maxMessages = (await this.getConfig()).maxHistoryLength;
    this.store.append(message);
  }

  async listConversations(): Promise<Array<Omit<ChatSession, 'messages'>>> {
    return this.store.list();
  }

  async newConversation(name?: string): Promise<string> {
    return this.store.create(name).id;
  }

  async switchConversation(id: string): Promise<void> {
    this.store.switchTo(id);
  }

  async getConfig(): Promise<ChatConfig> {
    const local = readStorage<ChatConfig>(LOCAL_CONFIG_KEY);
    if (local) return { ...DEFAULT_CONFIG, ...local };
    try {
      const profile = this.userProfile.get();
      const chatCfg = (profile as { chat?: Partial<ChatConfig> } | undefined)?.chat;
      if (chatCfg) return { ...DEFAULT_CONFIG, ...chatCfg };
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_CONFIG };
  }

  async updateConfig(config: Partial<ChatConfig>): Promise<void> {
    const current = await this.getConfig();
    const merged = { ...current, ...config };
    writeStorage(LOCAL_CONFIG_KEY, merged);
    try {
      await this.userProfile.set({
        patch: { chat: merged } as unknown as Record<string, unknown>,
        source: 'user',
      });
    } catch {
      /* profile may not accept `chat` field yet — 本地缓存已保存，允许失败 */
    }
  }

  async getAvailableModels(): Promise<AIModelConfig[]> {
    const list = readStorage<AIModelConfig[]>(LOCAL_MODELS_KEY);
    if (list && list.length > 0) return list;
    writeStorage(LOCAL_MODELS_KEY, DEFAULT_MODELS);
    return [...DEFAULT_MODELS];
  }

  async addModel(model: AIModelConfig): Promise<void> {
    const list = await this.getAvailableModels();
    const next = list.filter((m) => m.id !== model.id).concat(model);
    writeStorage(LOCAL_MODELS_KEY, next);
  }

  async removeModel(modelId: string): Promise<void> {
    const list = await this.getAvailableModels();
    writeStorage(
      LOCAL_MODELS_KEY,
      list.filter((m) => m.id !== modelId),
    );
  }

  async updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void> {
    const list = await this.getAvailableModels();
    const next = list.map((m) => (m.id === modelId ? { ...m, ...updates } : m));
    writeStorage(LOCAL_MODELS_KEY, next);
  }

  async testModelConnection(modelId: string): Promise<boolean> {
    try {
      await this.chat.sendMessage({
        provider: modelId,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}

export class MockIPCClient implements IPCClient {
  private history: ChatMessage[] = [
    { id: '1', role: 'user', content: '你好', timestamp: Date.now() - 60000 },
    {
      id: '2',
      role: 'assistant',
      content: '你好！有什么可以帮助你的吗？',
      timestamp: Date.now() - 50000,
    },
  ];
  private config: ChatConfig = { ...DEFAULT_CONFIG };
  private models: AIModelConfig[] = [...DEFAULT_MODELS];

  async sendMessage(message: string, modelId?: string, history?: ChatMessage[]): Promise<string> {
    console.log(
      '[Mock] Send message:',
      message,
      'to model:',
      modelId,
      'history:',
      history?.length ?? 0,
    );
    await new Promise((r) => setTimeout(r, 500));
    return `模拟回复: ${message}`;
  }

  async sendStreamMessage(
    message: string,
    _modelId?: string,
    onChunk?: (chunk: string) => void,
  ): Promise<void> {
    const chunks = ['模拟', '流式', '回复', '内容'];
    for (const c of chunks) {
      await new Promise((r) => setTimeout(r, 200));
      onChunk?.(c + ' ');
    }
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    return [...this.history];
  }

  async clearChatHistory(): Promise<void> {
    this.history = [];
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    this.history.push(message);
  }

  async listConversations(): Promise<Array<Omit<ChatSession, 'messages'>>> {
    return [{ id: 'mock', name: 'Mock 对话', createdAt: 0, updatedAt: 0 }];
  }

  async newConversation(): Promise<string> {
    this.history = [];
    return 'mock';
  }

  async switchConversation(): Promise<void> {
    /* mock 只有一个会话 */
  }

  async getConfig(): Promise<ChatConfig> {
    return { ...this.config };
  }

  async updateConfig(config: Partial<ChatConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  async getAvailableModels(): Promise<AIModelConfig[]> {
    return [...this.models];
  }

  async addModel(model: AIModelConfig): Promise<void> {
    this.models = this.models.filter((m) => m.id !== model.id).concat(model);
  }

  async removeModel(modelId: string): Promise<void> {
    this.models = this.models.filter((m) => m.id !== modelId);
  }

  async updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void> {
    this.models = this.models.map((m) => (m.id === modelId ? { ...m, ...updates } : m));
  }

  async testModelConnection(modelId: string): Promise<boolean> {
    console.log('[Mock] Test model connection:', modelId);
    return true;
  }
}

export const createIPCClient = (client?: ClientAIClient): IPCClient => {
  if (client) return new SdkIPCClient(client);
  if (typeof window !== 'undefined' && (window as { aiIPC?: unknown }).aiIPC) {
    return new SdkIPCClient();
  }
  console.warn('window.aiIPC 未就绪，使用 Mock 客户端（开发/测试模式）');
  return new MockIPCClient();
};
