/**
 * 对话标签状态：主进程是唯一数据源（标签元数据 + CLI 标签消息），这里只做订阅与缓存。
 * 标签 'main' 为原有对话（消息走 AiChatContext）；其它标签只绑定编程助手后端。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  MAIN_TAB_ID,
  harnessClient,
  type HarnessBackend,
  type HarnessLiveEvent,
  type HarnessTabMessage,
  type HarnessTabMeta,
  type HarnessTabsState,
} from '../services/harnessClient';

export interface TabLive {
  text: string;
  tool?: string;
  /** Claude can_use_tool 待确认 */
  permission?: { id: string; summary: string };
}

interface HarnessTabsValue {
  available: boolean;
  state: HarnessTabsState | null;
  activeTab: HarnessTabMeta | null;
  /** 当前标签是独立的 CLI 标签（非 main） */
  isCliTab: boolean;
  messages: HarnessTabMessage[];
  live: Record<string, TabLive>;
  create: (backend: HarnessBackend, cwd?: string) => Promise<void>;
  close: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  cycle: (dir: 1 | -1) => void;
  selectIndex: (i: number) => void;
  send: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  replyPermission: (requestId: string, allow: boolean) => Promise<void>;
  /** 最近使用的编程助手后端（新建标签默认） */
  lastBackend: HarnessBackend;
}

const Ctx = createContext<HarnessTabsValue | null>(null);
const LAST_BACKEND_KEY = 'nomi.tabs.lastBackend';

export function HarnessTabsProvider({ children }: { children: React.ReactNode }) {
  const available = harnessClient.available();
  const [state, setState] = useState<HarnessTabsState | null>(null);
  const [cache, setCache] = useState<Record<string, HarnessTabMessage[]>>({});
  const [live, setLive] = useState<Record<string, TabLive>>({});
  const [lastBackend, setLastBackend] = useState<HarnessBackend>(() => {
    try {
      const v = localStorage.getItem(LAST_BACKEND_KEY);
      return v === 'codex' || v === 'dsh' ? v : 'claude';
    } catch {
      return 'claude';
    }
  });

  useEffect(() => {
    if (!available) return;
    void harnessClient
      .tabs()
      .then(setState)
      .catch(() => undefined);
    const off1 = harnessClient.onTabs((s) => {
      setState(s);
      // 结束运行的标签清掉实时进度
      setLive((cur) => {
        const next = { ...cur };
        for (const t of s.tabs) if (t.status !== 'running') delete next[t.id];
        return next;
      });
    });
    const off2 = harnessClient.onTabMessage(({ tabId, message }) =>
      setCache((cur) =>
        cur[tabId] && !cur[tabId]!.some((m) => m.id === message.id)
          ? { ...cur, [tabId]: [...cur[tabId]!, message] }
          : cur,
      ),
    );
    const off3 = harnessClient.onEvent((raw) => {
      const e = raw as HarnessLiveEvent;
      if (!e || typeof e.tabId !== 'string') return;
      setLive((cur) => {
        const prev = cur[e.tabId] ?? { text: '' };
        if (e.type === 'text-delta')
          return { ...cur, [e.tabId]: { ...prev, text: prev.text + e.text } };
        if (e.type === 'text') return { ...cur, [e.tabId]: { ...prev, text: e.text } };
        if (e.type === 'tool' && e.status === 'start')
          return { ...cur, [e.tabId]: { ...prev, tool: e.name } };
        if (e.type === 'permission')
          return {
            ...cur,
            [e.tabId]: { ...prev, permission: { id: e.id, summary: e.summary } },
          };
        if (e.type === 'done' || e.type === 'error') {
          const { permission: _p, ...rest } = prev;
          return { ...cur, [e.tabId]: rest };
        }
        return cur;
      });
    });
    return () => {
      off1();
      off2();
      off3();
    };
  }, [available]);

  const activeId = state?.activeTabId ?? MAIN_TAB_ID;
  const activeTab = state?.tabs.find((t) => t.id === activeId) ?? null;
  const isCliTab = !!activeTab && activeTab.id !== MAIN_TAB_ID;

  // 切到 CLI 标签时拉取消息（首次）
  useEffect(() => {
    if (!available || !isCliTab || cache[activeId]) return;
    void harnessClient
      .tabMessages(activeId)
      .then((list) => setCache((cur) => ({ ...cur, [activeId]: list })))
      .catch(() => undefined);
  }, [available, isCliTab, activeId, cache]);

  const create = useCallback(async (backend: HarnessBackend, cwd?: string) => {
    const tab = await harnessClient.createTab(cwd ? { backend, cwd } : { backend });
    setCache((cur) => ({ ...cur, [tab.id]: [] }));
    setLastBackend(backend);
    try {
      localStorage.setItem(LAST_BACKEND_KEY, backend);
    } catch {
      /* ignore */
    }
  }, []);
  const close = useCallback(async (id: string) => {
    if (id === MAIN_TAB_ID) return;
    await harnessClient.closeTab(id);
    setCache((cur) => {
      const next = { ...cur };
      delete next[id];
      return next;
    });
  }, []);
  const rename = useCallback(async (id: string, title: string) => {
    await harnessClient.renameTab(id, title);
  }, []);
  const activate = useCallback(async (id: string) => {
    await harnessClient.activateTab(id);
  }, []);
  const ids = useMemo(() => state?.tabs.map((t) => t.id) ?? [], [state]);
  const cycle = useCallback(
    (dir: 1 | -1) => {
      if (ids.length < 2) return;
      const i = ids.indexOf(activeId);
      void harnessClient.activateTab(ids[(i + dir + ids.length) % ids.length]!);
    },
    [ids, activeId],
  );
  const selectIndex = useCallback(
    (i: number) => {
      const id = i >= 8 ? ids[ids.length - 1] : ids[i];
      if (id) void harnessClient.activateTab(id);
    },
    [ids],
  );
  const send = useCallback(
    async (text: string) => {
      if (!isCliTab) return;
      setLive((cur) => ({ ...cur, [activeId]: { text: '' } }));
      // 结果经 tab-message 事件进入缓存；这里只吞掉错误（错误也会作为消息写入标签）
      await harnessClient.sendTab(activeId, text).catch(() => undefined);
    },
    [isCliTab, activeId],
  );
  const cancel = useCallback(async () => {
    if (isCliTab) await harnessClient.cancelTab(activeId);
  }, [isCliTab, activeId]);
  const replyPermission = useCallback(
    async (requestId: string, allow: boolean) => {
      if (!isCliTab) return;
      await harnessClient.replyPermission(activeId, requestId, allow).catch(() => undefined);
      setLive((cur) => {
        const prev = cur[activeId];
        if (!prev?.permission || prev.permission.id !== requestId) return cur;
        const { permission: _p, ...rest } = prev;
        return { ...cur, [activeId]: rest };
      });
    },
    [isCliTab, activeId],
  );

  const value: HarnessTabsValue = {
    available,
    state,
    activeTab,
    isCliTab,
    messages: (isCliTab && cache[activeId]) || [],
    live,
    create,
    close,
    rename,
    activate,
    cycle,
    selectIndex,
    send,
    cancel,
    replyPermission,
    lastBackend,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const EMPTY: HarnessTabsValue = {
  available: false,
  state: null,
  activeTab: null,
  isCliTab: false,
  messages: [],
  live: {},
  create: async () => undefined,
  close: async () => undefined,
  rename: async () => undefined,
  activate: async () => undefined,
  cycle: () => undefined,
  selectIndex: () => undefined,
  send: async () => undefined,
  cancel: async () => undefined,
  replyPermission: async () => undefined,
  lastBackend: 'claude',
};

export function useHarnessTabs(): HarnessTabsValue {
  return useContext(Ctx) ?? EMPTY;
}
