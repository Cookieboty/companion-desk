import { t } from '@nomi-ai/ui';

export type HarnessBackend = 'nomi' | 'claude' | 'codex' | 'dsh';

export interface HarnessState {
  backend: HarnessBackend;
  cwd: string;
  cliSessionId: string | null;
  busy: boolean;
  toolsDisabled: boolean;
  bins: Record<string, string | null>;
}

export type HarnessTabStatus = 'idle' | 'queued' | 'running' | 'error';

export interface HarnessTabMeta {
  id: string;
  title: string;
  backend: HarnessBackend;
  cwd: string;
  cliSessionId: string | null;
  status: HarnessTabStatus;
  unread: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export interface HarnessTabsState {
  tabs: HarnessTabMeta[];
  activeTabId: string;
  maxConcurrent: number;
  running: number;
  queued: number;
}

export interface HarnessTabMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  error?: boolean;
  tools?: string[];
}

export type HarnessLiveEvent =
  | { tabId: string; type: 'text-delta' | 'text'; text: string }
  | { tabId: string; type: 'tool'; name: string; status: 'start' | 'done' | 'error' }
  | { tabId: string; type: 'done'; text: string; sessionId?: string }
  | { tabId: string; type: 'error'; message: string }
  | { tabId: string; type: 'permission'; id: string; summary: string };

export const MAIN_TAB_ID = 'main';

export interface HarnessSendResult {
  text: string;
  sessionId: string | null;
}

interface AiBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, fn: (payload: unknown) => void) => () => void;
}
const bridge = (): AiBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  const b = (window as unknown as { aiIPC?: AiBridge }).aiIPC;
  return b && typeof b.invoke === 'function' ? b : undefined;
};

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const b = bridge();
  if (!b) throw new Error(t('编程助手接入需要在桌面应用中使用'));
  const r = (await b.invoke(`ai:harness:${method}`, ...args)) as T & {
    __error?: { message: string };
  };
  if (r && typeof r === 'object' && '__error' in r && r.__error) throw new Error(r.__error.message);
  return r;
}

export const harnessClient = {
  available: () => !!bridge(),
  state: () => call<HarnessState>('state'),
  setBackend: (b: HarnessBackend) => call<HarnessState>('set-backend', b),
  setCwd: (c: string) => call<HarnessState>('set-cwd', c),
  pickCwd: () => call<HarnessState>('pick-cwd'),
  send: (prompt: string) => call<HarnessSendResult>('send', prompt),
  onChanged: (fn: (s: HarnessState) => void) =>
    bridge()?.on('ai:harness:changed', (p) => fn(p as HarnessState)) ?? (() => undefined),
  onEvent: (fn: (e: unknown) => void) => bridge()?.on('ai:harness:event', fn) ?? (() => undefined),
  tabs: () => call<HarnessTabsState>('tabs'),
  createTab: (o: {
    backend: HarnessBackend;
    cwd?: string;
    title?: string;
    messages?: HarnessTabMessage[];
  }) => call<HarnessTabMeta>('tab-create', o),
  seedTabMessages: (id: string, messages: HarnessTabMessage[]) =>
    call<HarnessTabMeta>('tab-seed', id, messages),
  closeTab: (id: string) => call<HarnessTabsState>('tab-close', id),
  renameTab: (id: string, title: string) => call<HarnessTabMeta>('tab-rename', id, title),
  activateTab: (id: string) => call<HarnessTabsState>('tab-activate', id),
  setTabBackend: (id: string, b: HarnessBackend) => call<HarnessTabMeta>('tab-backend', id, b),
  pickTabCwd: (id: string) => call<HarnessTabMeta>('tab-pick-cwd', id),
  tabMessages: (id: string) => call<HarnessTabMessage[]>('tab-messages', id),
  sendTab: (id: string, prompt: string) => call<HarnessSendResult>('tab-send', id, prompt),
  cancelTab: (id: string) => call<boolean>('tab-cancel', id),
  setMaxConcurrent: (n: number) => call<HarnessTabsState>('set-max-concurrent', n),
  onTabs: (fn: (s: HarnessTabsState) => void) =>
    bridge()?.on('ai:harness:tabs', (p) => fn(p as HarnessTabsState)) ?? (() => undefined),
  onTabMessage: (fn: (e: { tabId: string; message: HarnessTabMessage }) => void) =>
    bridge()?.on('ai:harness:tab-message', (p) =>
      fn(p as { tabId: string; message: HarnessTabMessage }),
    ) ?? (() => undefined),
};
