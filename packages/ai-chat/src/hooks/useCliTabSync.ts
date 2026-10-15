/**
 * 把 harness CLI 标签镜像进 ConversationStore，供侧栏「全部 / 按端」统一渲染。
 */
import { useEffect } from 'react';

import { useAiChat } from '../contexts/AiChatContext';
import { useHarnessTabs } from '../contexts/HarnessTabsContext';
import { MAIN_TAB_ID, type HarnessBackend } from '../services/harnessClient';
import type { ConversationBackend } from '../types/chat';

function asBackend(b: HarnessBackend): ConversationBackend {
  return b;
}

export function useCliTabSync(onChange?: () => void): void {
  const { state } = useAiChat();
  const tabs = useHarnessTabs();
  const store = state.ipcClient.conversationStore?.();

  useEffect(() => {
    if (!store || !tabs.state) return;
    const cli = tabs.state.tabs.filter((t) => t.id !== MAIN_TAB_ID && t.backend !== 'nomi');
    const liveIds = new Set(cli.map((t) => t.id));
    for (const t of cli) {
      store.upsertFromTab({
        id: t.id,
        title: t.title,
        backend: asBackend(t.backend),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      });
    }
    // 侧栏里仍挂着已关闭标签的项 → 清掉
    for (const c of store.list()) {
      if (c.tabId && !liveIds.has(c.tabId)) store.removeByTabId(c.tabId);
    }
    onChange?.();
  }, [store, tabs.state, onChange]);
}
