import { t } from '@ig-live/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { useAiChat } from '../../contexts/AiChatContext';
import type { ChatSession } from '../../types/chat';

import styles from './index.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSettings?: () => void;
}

type Meta = Omit<ChatSession, 'messages'>;

const rel = (ts: number) => {
  const d = Date.now() - ts;
  if (d < 60_000) return t('刚刚');
  if (d < 3_600_000) return t('{0} 分钟前', Math.floor(d / 60_000));
  if (d < 86_400_000) return t('{0} 小时前', Math.floor(d / 3_600_000));
  return t('{0} 天前', Math.floor(d / 86_400_000));
};

/** Codex 风格的极简侧栏：新对话 + 历史线程列表，⌘/Ctrl+B 收起 */
export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onNewChat, onSettings }) => {
  const { state, actions } = useAiChat();
  const ipc = state.ipcClient;
  const [list, setList] = useState<Meta[]>([]);
  const [current, setCurrent] = useState<string | undefined>();

  const refresh = useCallback(() => {
    if (!ipc?.listConversations) return;
    void ipc
      .listConversations()
      .then((l) => {
        setList([...l].sort((a, b) => b.updatedAt - a.updatedAt));
        setCurrent(ipc.currentConversationId?.());
      })
      .catch(() => undefined);
  }, [ipc]);
  // 消息数量变化（新消息 / 新对话）时刷新列表
  useEffect(refresh, [refresh, state.messages.length]);

  const open = async (id: string) => {
    if (!ipc || id === current) return;
    await ipc.switchConversation(id);
    await actions.loadChatHistory();
    refresh();
  };

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
      data-testid="chat-sidebar"
    >
      <div className={styles.top}>
        <button
          className={styles.iconBtn}
          onClick={onToggle}
          title={collapsed ? t('展开侧边栏 (⌘/Ctrl+B)') : t('收起侧边栏 (⌘/Ctrl+B)')}
          aria-label={collapsed ? t('展开侧边栏') : t('收起侧边栏')}
          data-testid="sidebar-toggle"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M9 4v16" />
          </svg>
        </button>
        {!collapsed && <span className={styles.brand}>Companion Desk</span>}
      </div>

      <button
        className={styles.newChat}
        onClick={onNewChat}
        title={t('开始新对话')}
        data-testid="new-chat"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
        {!collapsed && <span>{t('新对话')}</span>}
      </button>

      {!collapsed && (
        <nav className={styles.threads} aria-label={t('历史对话')}>
          <div className={styles.sectionTitle}>{t('对话')}</div>
          {list.length === 0 && <div className={styles.empty}>{t('还没有历史对话')}</div>}
          {list.map((c) => (
            <button
              key={c.id}
              className={`${styles.thread} ${c.id === current ? styles.threadActive : ''}`}
              onClick={() => void open(c.id)}
              title={t(c.name)}
              data-testid="history-item"
            >
              <span className={styles.threadName}>{c.name ? t(c.name) : t('新对话')}</span>
              <span className={styles.threadTime}>{rel(c.updatedAt)}</span>
            </button>
          ))}
        </nav>
      )}
      {onSettings && (
        <button
          className={`${styles.newChat} ${styles.bottom}`}
          onClick={onSettings}
          title={t('设置 (⌘/Ctrl+,)')}
          data-testid="sidebar-settings"
        >
          <span aria-hidden>⚙</span>
          {!collapsed && <span>{t('设置')}</span>}
        </button>
      )}
    </aside>
  );
};
