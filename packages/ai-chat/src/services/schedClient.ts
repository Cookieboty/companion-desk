/** 主动日程客户端：`ai:sched:*` IPC */
import type { RepeatRule } from './desktopClient';

export type Frequency = 'low' | 'medium' | 'high';

export interface SchedSettings {
  quiet: { enabled: boolean; start: string; end: string };
  osNotify: boolean;
  proactive: {
    enabled: boolean;
    frequency: Frequency;
    activeStart: string;
    activeEnd: string;
    skipIfChattedMin: number;
  };
}

export interface SchedTask {
  id: string;
  name: string;
  prompt: string;
  time: string;
  repeat: RepeatRule;
  enabled: boolean;
  template?: 'briefing';
  nextRunAt: number;
  lastRunAt?: number;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
}

export interface TaskResult {
  id: string;
  taskId: string;
  name: string;
  at: number;
  ok: boolean;
  text: string;
  catchUp?: boolean;
}

export interface SchedState {
  settings: SchedSettings;
  tasks: SchedTask[];
  running: string[];
  quietNow: boolean;
  deferred: number;
  proactive: { today: number; lastAt: number; gate: { ok: boolean; reason: string } };
  notifySupported: boolean;
}

export const BRIEFING_PROMPT =
  '请为我写一份今天的简报：先一句问候，然后列出今天的提醒和安排，再根据你对我的了解给一两条贴心的小建议。简洁，不超过 150 字，用中文。';

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
  if (!b) throw new Error('日程功能需要在桌面应用中使用');
  const r = (await b.invoke(`ai:sched:${method}`, ...args)) as T & {
    __error?: { code: string; message: string };
  };
  if (r && typeof r === 'object' && '__error' in r && r.__error) throw new Error(r.__error.message);
  return r;
}
const on = (ch: string, fn: (p: unknown) => void) => bridge()?.on(ch, fn) ?? (() => undefined);

export const schedClient = {
  available: () => !!bridge(),
  state: () => call<SchedState>('state'),
  setSettings: (
    p: Partial<{ [K in keyof SchedSettings]: Partial<SchedSettings[K]> | SchedSettings[K] }>,
  ) => call<SchedSettings>('set-settings', p),
  upsertTask: (t: Partial<SchedTask>) => call<SchedTask>('upsert-task', t),
  toggleTask: (id: string, v: boolean) => call<boolean>('toggle-task', id, v),
  removeTask: (id: string) => call<boolean>('remove-task', id),
  runTask: (id: string) => call<TaskResult>('run-task', id),
  results: () => call<TaskResult[]>('results'),
  clearResults: () => call<boolean>('clear-results'),
  proactiveNow: () => call<string>('proactive-now'),
  activity: () => {
    if (bridge()) void call('activity').catch(() => undefined);
  },
  onChanged: (fn: () => void) => on('ai:sched:changed', () => fn()),
  onResult: (fn: (r: TaskResult) => void) => on('ai:sched:result', (p) => fn(p as TaskResult)),
};
