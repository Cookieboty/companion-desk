import { t } from '@nomi-ai/ui';

import type { HarnessTabMeta } from './harnessClient';

export type HistoryBackend = 'claude' | 'codex' | 'dsh';
export const HISTORY_BACKENDS: readonly HistoryBackend[] = ['claude', 'codex', 'dsh'];

export interface HistorySession {
  key: string;
  backend: HistoryBackend;
  sessionId: string;
  title: string;
  cwd?: string;
  cwdMissing: boolean;
  updatedAt: number;
}

export interface HistoryPage {
  items: HistorySession[];
  nextOffset: number | null;
  hasMore: boolean;
}

export interface HistoryOpenResult {
  ok: boolean;
  tab?: HarnessTabMeta;
  reused?: boolean;
  notice?: string;
  error?: string;
}

interface AiBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}
const bridge = (): AiBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  const b = (window as unknown as { aiIPC?: AiBridge }).aiIPC;
  return b && typeof b.invoke === 'function' ? b : undefined;
};

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const b = bridge();
  if (!b) throw new Error(t('编程助手接入需要在桌面应用中使用'));
  const r = (await b.invoke(channel, ...args)) as T & { __error?: { message: string } };
  if (r && typeof r === 'object' && '__error' in r && r.__error) throw new Error(r.__error.message);
  return r;
}

export const historyClient = {
  available: () => !!bridge(),
  list: (backend: HistoryBackend, o: { offset?: number; limit?: number; force?: boolean } = {}) =>
    call<HistoryPage>('ai:history:list', backend, o),
  open: (backend: HistoryBackend, sessionId: string) =>
    call<HistoryOpenResult>('ai:history:open', backend, sessionId),
};
