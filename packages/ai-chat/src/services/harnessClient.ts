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
};
