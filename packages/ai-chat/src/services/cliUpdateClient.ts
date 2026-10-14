import { t } from '@nomi-ai/ui';

export interface CliInstallInfo {
  kind: 'claude' | 'codex' | 'cursor';
  path: string | null;
  version: string | null;
  latest: string | null;
  installMethod: 'npm' | 'native' | 'unknown';
  updateAvailable: boolean;
  updateSupported: boolean;
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
  const r = (await b.invoke(`ai:cli-update:${method}`, ...args)) as T & {
    __error?: { message: string };
  };
  if (r && typeof r === 'object' && '__error' in r && r.__error) throw new Error(r.__error.message);
  return r;
}

export const cliUpdateClient = {
  available: () => !!bridge(),
  inspect: (refresh = false) => call<CliInstallInfo[]>('inspect', refresh),
  preview: (kind: 'claude' | 'codex') =>
    call<{ argv: string[] } | { error: string }>('preview', kind),
  run: (kind: 'claude' | 'codex') =>
    call<{ ok: boolean; log: string; version: string | null }>('run', kind),
  onEvent: (fn: (e: unknown) => void) =>
    bridge()?.on('ai:cli-update:event', fn) ?? (() => undefined),
};
