/**
 * ConversationStore —— 按会话持久化聊天记录（渲染进程 localStorage）。
 *
 * 存储布局：
 *   ai-chat:conversations          → ChatSession 元信息列表（不含 messages）
 *   ai-chat:conversation:<id>      → 该会话的 ChatMessage[]
 *   ai-chat:currentConversation    → 当前会话 id
 * 旧版单会话 `ai-chat:history` 在首次访问时迁移为一个会话。
 * 无 localStorage（测试 / 非浏览器）时退化为内存存储。
 */

import type { ChatMessage, ChatSession } from '../types/chat';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ConversationMeta = Omit<ChatSession, 'messages'>;

const INDEX_KEY = 'ai-chat:conversations';
const CURRENT_KEY = 'ai-chat:currentConversation';
const LEGACY_HISTORY_KEY = 'ai-chat:history';
const messagesKey = (id: string) => `ai-chat:conversation:${id}`;

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function defaultStorage(): KeyValueStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* localStorage 可能被禁用 */
  }
  return createMemoryStorage();
}

export interface ConversationStoreOptions {
  storage?: KeyValueStorage;
  /** 每个会话最多保留的消息条数（超出丢弃最旧的），默认 1000 */
  maxMessages?: number;
  now?: () => number;
  newId?: () => string;
}

export class ConversationStore {
  private readonly storage: KeyValueStorage;
  private readonly now: () => number;
  private readonly newId: () => string;
  maxMessages: number;

  constructor(opts: ConversationStoreOptions = {}) {
    this.storage = opts.storage ?? defaultStorage();
    this.maxMessages = opts.maxMessages ?? 1000;
    this.now = opts.now ?? Date.now;
    this.newId =
      opts.newId ??
      (() => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    this.migrateLegacy();
  }

  list(): ConversationMeta[] {
    return this.read<ConversationMeta[]>(INDEX_KEY) ?? [];
  }

  /** 当前会话 id；不存在时自动创建一个 */
  currentId(): string {
    const id = this.read<string>(CURRENT_KEY);
    if (id && this.list().some((c) => c.id === id)) return id;
    return this.create().id;
  }

  create(name?: string): ConversationMeta {
    const ts = this.now();
    const meta: ConversationMeta = {
      id: this.newId(),
      name: name ?? '新对话',
      createdAt: ts,
      updatedAt: ts,
    };
    this.write(INDEX_KEY, [...this.list(), meta]);
    this.write(messagesKey(meta.id), []);
    this.write(CURRENT_KEY, meta.id);
    return meta;
  }

  switchTo(id: string): void {
    if (!this.list().some((c) => c.id === id)) throw new Error(`unknown conversation: ${id}`);
    this.write(CURRENT_KEY, id);
  }

  getMessages(id: string = this.currentId()): ChatMessage[] {
    return this.read<ChatMessage[]>(messagesKey(id)) ?? [];
  }

  append(message: ChatMessage, id: string = this.currentId()): void {
    const next = [...this.getMessages(id), message];
    this.write(messagesKey(id), next.slice(-this.maxMessages));
    this.touch(id, message);
  }

  /** 清空会话消息（会话本身保留） */
  clear(id: string = this.currentId()): void {
    this.write(messagesKey(id), []);
    this.touch(id);
  }

  delete(id: string): void {
    this.write(
      INDEX_KEY,
      this.list().filter((c) => c.id !== id),
    );
    this.storage.removeItem(messagesKey(id));
    if (this.read<string>(CURRENT_KEY) === id) this.storage.removeItem(CURRENT_KEY);
  }

  private touch(id: string, message?: ChatMessage): void {
    this.write(
      INDEX_KEY,
      this.list().map((c) => {
        if (c.id !== id) return c;
        const named =
          message && message.role === 'user' && c.name === '新对话'
            ? message.content.slice(0, 30)
            : c.name;
        return { ...c, name: named, updatedAt: this.now(), modelId: message?.modelId ?? c.modelId };
      }),
    );
  }

  private migrateLegacy(): void {
    const legacy = this.read<ChatMessage[]>(LEGACY_HISTORY_KEY);
    if (!legacy) return;
    this.storage.removeItem(LEGACY_HISTORY_KEY);
    if (legacy.length === 0) return;
    const meta = this.create('历史对话');
    this.write(messagesKey(meta.id), legacy.slice(-this.maxMessages));
  }

  private read<T>(key: string): T | undefined {
    try {
      const raw = this.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / disabled storage */
    }
  }
}
