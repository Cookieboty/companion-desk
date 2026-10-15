/**
 * 对话 UI 偏好：普通/开发模式、侧栏「全部|按端」。
 * 持久化在 localStorage（与 ConversationStore 同层）；桌面端无需主进程同步。
 */
export type ChatMode = 'normal' | 'dev';
export type ConversationListView = 'all' | 'by-endpoint';

const MODE_KEY = 'ai-chat:chatMode';
const LIST_VIEW_KEY = 'ai-chat:conversationListView';
const ENDPOINT_FILTER_KEY = 'ai-chat:endpointFilter';

type Listener = () => void;
const modeSubs = new Set<Listener>();
const listSubs = new Set<Listener>();

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const v = window.localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function getChatMode(): ChatMode {
  return read(MODE_KEY, ['normal', 'dev'] as const, 'normal');
}

export function setChatMode(mode: ChatMode): void {
  write(MODE_KEY, mode);
  modeSubs.forEach((fn) => fn());
}

export function subscribeChatMode(fn: Listener): () => void {
  modeSubs.add(fn);
  return () => void modeSubs.delete(fn);
}

export function getConversationListView(): ConversationListView {
  return read(LIST_VIEW_KEY, ['all', 'by-endpoint'] as const, 'all');
}

export function setConversationListView(view: ConversationListView): void {
  write(LIST_VIEW_KEY, view);
  listSubs.forEach((fn) => fn());
}

export function subscribeConversationListView(fn: Listener): () => void {
  listSubs.add(fn);
  return () => void listSubs.delete(fn);
}

import type { ConversationBackend } from '../types/chat';
import { isConversationBackend } from '../types/chat';

export function getEndpointFilter(): ConversationBackend {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'nomi';
    const v = window.localStorage.getItem(ENDPOINT_FILTER_KEY);
    return isConversationBackend(v) ? v : 'nomi';
  } catch {
    return 'nomi';
  }
}

export function setEndpointFilter(backend: ConversationBackend): void {
  write(ENDPOINT_FILTER_KEY, backend);
  listSubs.forEach((fn) => fn());
}

// ───── 供应商页当前端点（设置 → 供应商 顶部的端点切换） ─────
const PROVIDER_ENDPOINT_KEY = 'ai-chat:providerEndpoint';
const providerEpSubs = new Set<Listener>();

export function getProviderEndpoint(): ConversationBackend {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'nomi';
    const v = window.localStorage.getItem(PROVIDER_ENDPOINT_KEY);
    return isConversationBackend(v) ? v : 'nomi';
  } catch {
    return 'nomi';
  }
}

export function setProviderEndpoint(backend: ConversationBackend): void {
  write(PROVIDER_ENDPOINT_KEY, backend);
  providerEpSubs.forEach((fn) => fn());
}

export function subscribeProviderEndpoint(fn: Listener): () => void {
  providerEpSubs.add(fn);
  return () => void providerEpSubs.delete(fn);
}
