/**
 * 供应商页当前选中的端点（Nomi / Claude Code / Codex / dsh），持久化在 localStorage。
 */
import { useCallback, useSyncExternalStore } from 'react';

import {
  getProviderEndpoint,
  setProviderEndpoint,
  subscribeProviderEndpoint,
} from '../services/chatPrefs';
import type { ConversationBackend } from '../types/chat';

export function useProviderEndpoint(): [ConversationBackend, (b: ConversationBackend) => void] {
  const ep = useSyncExternalStore(
    subscribeProviderEndpoint,
    getProviderEndpoint,
    () => 'nomi' as ConversationBackend,
  );
  const set = useCallback((b: ConversationBackend) => setProviderEndpoint(b), []);
  return [ep, set];
}
