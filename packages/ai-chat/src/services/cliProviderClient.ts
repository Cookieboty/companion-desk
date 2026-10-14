import { t } from '@nomi-ai/ui';

export interface CliProviderProfile {
  id: string;
  kind: 'claude' | 'codex';
  name: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string;
  active: boolean;
}

export interface CliProviderState {
  profiles: CliProviderProfile[];
  ccSwitchWarning: boolean;
  claudeSettings: string;
  codexConfig: string;
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
  const r = (await b.invoke(`ai:cli-provider:${method}`, ...args)) as T & {
    __error?: { message: string };
  };
  if (r && typeof r === 'object' && '__error' in r && r.__error) throw new Error(r.__error.message);
  return r;
}

export const cliProviderClient = {
  available: () => !!bridge(),
  state: () => call<CliProviderState>('state'),
  upsert: (p: {
    id?: string;
    kind: 'claude' | 'codex';
    name: string;
    baseUrl: string;
    model: string;
    apiKey?: string;
  }) => call<CliProviderProfile>('upsert', p),
  remove: (id: string) => call<CliProviderState>('remove', id),
  activate: (id: string) =>
    call<{
      ok: boolean;
      backups: string[];
      restartRequired: boolean;
      ccSwitchWarning: boolean;
      error?: string;
    }>('activate', id),
  backups: () => call<string[]>('backups'),
  restore: (ts: string) => call<{ ok: boolean; error?: string }>('restore', ts),
  onChanged: (fn: (s: CliProviderState) => void) =>
    bridge()?.on('ai:cli-provider:changed', (p) => fn(p as CliProviderState)) ?? (() => undefined),
};
