import { useCallback, useSyncExternalStore } from 'react';

import {
  getConversationListView,
  setConversationListView as persist,
  getEndpointFilter,
  setEndpointFilter as persistFilter,
  subscribeConversationListView,
  type ConversationListView,
} from '../services/chatPrefs';
import type { ConversationBackend } from '../types/chat';

export function useConversationListView(): {
  view: ConversationListView;
  setView: (v: ConversationListView) => void;
  endpointFilter: ConversationBackend;
  setEndpointFilter: (b: ConversationBackend) => void;
} {
  const view = useSyncExternalStore(
    subscribeConversationListView,
    getConversationListView,
    () => 'all' as ConversationListView,
  );
  const endpointFilter = useSyncExternalStore(
    subscribeConversationListView,
    getEndpointFilter,
    () => 'nomi' as ConversationBackend,
  );
  const setView = useCallback((v: ConversationListView) => persist(v), []);
  const setEndpointFilter = useCallback((b: ConversationBackend) => persistFilter(b), []);
  return { view, setView, endpointFilter, setEndpointFilter };
}
