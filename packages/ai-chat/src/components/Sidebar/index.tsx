import { t } from '@nomi-ai/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';

import { useAiChat } from '../../contexts/AiChatContext';
import { useHarnessTabs } from '../../contexts/HarnessTabsContext';
import { useChatMode } from '../../hooks/useChatMode';
import { useCliTabSync } from '../../hooks/useCliTabSync';
import { useConversationListView } from '../../hooks/useConversationListView';
import { MAIN_TAB_ID, harnessClient, type HarnessTabMeta } from '../../services/harnessClient';
import type { ConversationBackend, ChatSession } from '../../types/chat';
import { CONVERSATION_BACKENDS } from '../../types/chat';
import { ENDPOINT_FULL } from '../../utils/endpointBadge';
import { EndpointIcon } from '../EndpointIcon';

import styles from './index.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSettings?: () => void;
  onForkRequest?: (id: string, mode: 'same' | 'cross') => void;
}

type Meta = Omit<ChatSession, 'messages'>;

const rel = (ts: number) => {
  const d = Date.now() - ts;
  if (d < 60_000) return t('刚刚');
  if (d < 3_600_000) return t('{0} 分钟前', Math.floor(d / 60_000));
  if (d < 86_400_000) return t('{0} 小时前', Math.floor(d / 3_600_000));
  return t('{0} 天前', Math.floor(d / 86_400_000));
};

function liveOf(tab: HarnessTabMeta | undefined): string {
  if (!tab) return '';
  if (tab.status === 'running' || tab.status === 'queued' || tab.status === 'error')
    return tab.status;
  return tab.unread > 0 ? 'unread' : '';
}

const ThreadItem: React.FC<{
  c: Meta;
  active: boolean;
  tab?: HarnessTabMeta;
  onOpen: (id: string) => void;
  onCtx: (id: string, e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}> = ({ c, active, tab, onOpen, onCtx, style }) => (
  <button
    className={`${styles.thread} ${active ? styles.threadActive : ''}`}
    style={style}
    onClick={() => void onOpen(c.id)}
    onContextMenu={(e) => onCtx(c.id, e)}
    title={t(c.name)}
    data-testid="history-item"
    data-backend={c.backend}
    data-conversation-id={c.id}
  >
    <span className={styles.dot} data-live={liveOf(tab) || undefined} aria-hidden />
    <EndpointIcon backend={c.backend} size={14} />
    <span className={styles.threadName}>{c.name ? t(c.name) : t('新对话')}</span>
    <span className={styles.threadTime}>{rel(c.updatedAt)}</span>
  </button>
);

type VirtualProps = {
  items: Meta[];
  current?: string;
  tabById: Map<string, HarnessTabMeta>;
  open: (id: string) => void;
  onCtx: (id: string, e: React.MouseEvent) => void;
};

const VirtualRow = ({
  index,
  style,
  items,
  current,
  tabById,
  open,
  onCtx,
  ariaAttributes,
}: RowComponentProps<VirtualProps>) => {
  const c = items[index]!;
  return (
    <div style={style} {...ariaAttributes}>
      <ThreadItem
        c={c}
        active={c.id === current}
        tab={c.tabId ? tabById.get(c.tabId) : undefined}
        onOpen={open}
        onCtx={onCtx}
      />
    </div>
  );
};

/** 侧栏：全部 / 按端 + 端点徽标；点击按后端路由到主对话或 CLI 标签 */
export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  onNewChat,
  onSettings,
  onForkRequest,
}) => {
  const { state, actions } = useAiChat();
  const ipc = state.ipcClient;
  const tabs = useHarnessTabs();
  const { isDev, isNormal, setMode } = useChatMode();
  const { view, setView, endpointFilter, setEndpointFilter } = useConversationListView();
  const [list, setList] = useState<Meta[]>([]);
  const [current, setCurrent] = useState<string | undefined>();
  const [bins, setBins] = useState<Record<string, string | null>>({});
  const [newMenu, setNewMenu] = useState(false);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useCliTabSync(refresh);
  useEffect(refresh, [refresh, state.messages.length, tabs.state]);

  useEffect(() => {
    if (!harnessClient.available()) return;
    void harnessClient
      .state()
      .then((s) => setBins(s.bins))
      .catch(() => undefined);
  }, [isDev]);

  useEffect(() => {
    if (!newMenu && !ctx) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && menuRef.current?.contains(e.target as Node)) return;
      setNewMenu(false);
      setCtx(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [newMenu, ctx]);

  const tabById = useMemo(() => {
    const m = new Map<string, HarnessTabMeta>();
    for (const x of tabs.state?.tabs ?? []) m.set(x.id, x);
    return m;
  }, [tabs.state]);

  const counts = useMemo(() => {
    const c: Record<ConversationBackend, number> = { nomi: 0, claude: 0, codex: 0, dsh: 0 };
    for (const x of list) c[x.backend] = (c[x.backend] ?? 0) + 1;
    return c;
  }, [list]);

  const visible = useMemo(() => {
    if (view === 'by-endpoint') return list.filter((x) => x.backend === endpointFilter);
    return list;
  }, [list, view, endpointFilter]);

  const open = useCallback(
    async (id: string) => {
      if (!ipc) return;
      const meta =
        list.find((x) => x.id === id) ?? (await ipc.listConversations()).find((x) => x.id === id);
      if (!meta) return;
      setCtx(null);

      if (meta.backend !== 'nomi' && meta.tabId) {
        if (!isDev) setMode('dev');
        await tabs.activate(meta.tabId);
        await ipc.switchConversation(id).catch(() => undefined);
        refresh();
        return;
      }

      if (tabs.available) await tabs.activate(MAIN_TAB_ID);
      if (harnessClient.available()) {
        await harnessClient.setBackend('nomi').catch(() => undefined);
      }
      if (id !== current) {
        await ipc.switchConversation(id);
        await actions.loadChatHistory();
      }
      refresh();
    },
    [ipc, list, isDev, setMode, tabs, refresh, current, actions],
  );

  const createFor = async (backend: ConversationBackend) => {
    setNewMenu(false);
    if (backend === 'nomi') {
      if (tabs.available) await tabs.activate(MAIN_TAB_ID);
      if (harnessClient.available()) await harnessClient.setBackend('nomi').catch(() => undefined);
      onNewChat();
      const store = ipc.conversationStore?.();
      if (store) {
        const id = store.currentId();
        const m = store.get(id);
        if (m && m.backend !== 'nomi') store.updateMeta(id, { backend: 'nomi' });
      }
      refresh();
      return;
    }
    if (!isDev) setMode('dev');
    if (!tabs.available) return;
    await tabs.create(backend);
    refresh();
  };

  const handleNewClick = () => {
    if (isNormal) {
      void createFor('nomi');
      return;
    }
    if (view === 'by-endpoint') {
      void createFor(endpointFilter);
      return;
    }
    setNewMenu((v) => !v);
  };

  const removeItem = async (id: string) => {
    setCtx(null);
    const meta = list.find((x) => x.id === id);
    if (!meta || !ipc) return;
    if (meta.tabId) {
      await tabs.close(meta.tabId);
    } else {
      await ipc.deleteConversation?.(id);
      if (id === current) {
        onNewChat();
        await actions.loadChatHistory();
      }
    }
    refresh();
  };

  const onCtx = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setNewMenu(false);
    setCtx({ id, x: e.clientX, y: e.clientY });
  };

  const cliMissing = (b: ConversationBackend) => b !== 'nomi' && !bins[b];

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
        {!collapsed && <span className={styles.brand}>Nomi</span>}
      </div>

      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          className={styles.newChat}
          onClick={handleNewClick}
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
        {newMenu && !collapsed && (
          <div className={styles.newMenu} role="menu" data-testid="new-chat-menu">
            {CONVERSATION_BACKENDS.map((b) => (
              <button
                key={b}
                type="button"
                role="menuitem"
                className={styles.newMenuItem}
                disabled={cliMissing(b)}
                onClick={() => void createFor(b)}
                data-testid={`new-chat-${b}`}
              >
                <EndpointIcon backend={b} size={16} decorative />
                <span>{ENDPOINT_FULL[b]()}</span>
                {cliMissing(b) && <span className={styles.newMenuMiss}>{t('未安装')}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className={styles.listHeader}>
          <div className={styles.seg} role="group" aria-label={t('对话列表视图')}>
            <button
              type="button"
              className={styles.segBtn}
              aria-pressed={view === 'all'}
              data-testid="list-view-all"
              onClick={() => setView('all')}
            >
              {t('全部')}
            </button>
            <button
              type="button"
              className={styles.segBtn}
              aria-pressed={view === 'by-endpoint'}
              data-testid="list-view-by-endpoint"
              onClick={() => setView('by-endpoint')}
            >
              {t('按端')}
            </button>
          </div>
          {view === 'by-endpoint' && (
            <div className={styles.epRow} role="group" aria-label={t('按端点筛选')}>
              {CONVERSATION_BACKENDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={styles.epChip}
                  aria-pressed={endpointFilter === b}
                  disabled={cliMissing(b)}
                  data-testid={`endpoint-filter-${b}`}
                  onClick={() => setEndpointFilter(b)}
                  title={ENDPOINT_FULL[b]()}
                >
                  <EndpointIcon backend={b} size={14} decorative />
                  <span>{ENDPOINT_FULL[b]()}</span>
                  <span className={styles.epCount}>{counts[b]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!collapsed && (
        <nav className={styles.threads} aria-label={t('历史对话')} data-testid="conversation-list">
          <div className={styles.sectionTitle}>
            {view === 'by-endpoint' ? ENDPOINT_FULL[endpointFilter]() : t('对话')}
          </div>
          {visible.length === 0 && <div className={styles.empty}>{t('还没有历史对话')}</div>}
          {visible.length > 0 &&
            visible.length <= 100 &&
            visible.map((c) => (
              <ThreadItem
                key={c.id}
                c={c}
                active={c.id === current}
                tab={c.tabId ? tabById.get(c.tabId) : undefined}
                onOpen={open}
                onCtx={onCtx}
              />
            ))}
          {visible.length > 100 && (
            <div style={{ height: '100%', minHeight: 320 }} data-testid="conversation-list-virtual">
              <List
                rowCount={visible.length}
                rowHeight={52}
                rowComponent={VirtualRow}
                rowProps={{
                  items: visible,
                  current,
                  tabById,
                  open,
                  onCtx,
                }}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          )}
        </nav>
      )}

      {ctx && (
        <div
          className={styles.ctx}
          style={{ left: ctx.x, top: ctx.y }}
          role="menu"
          data-testid="conversation-context-menu"
        >
          <button
            type="button"
            role="menuitem"
            className={styles.ctxItem}
            onClick={() => {
              onForkRequest?.(ctx.id, 'same');
              setCtx(null);
            }}
            data-testid="fork-same"
          >
            {t('分叉为新对话')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.ctxItem}
            onClick={() => {
              onForkRequest?.(ctx.id, 'cross');
              setCtx(null);
            }}
            data-testid="fork-cross"
          >
            {t('分叉到其他端')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.ctxItem}
            onClick={() => void removeItem(ctx.id)}
            data-testid="conversation-delete"
          >
            {t('删除对话')}
          </button>
        </div>
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
