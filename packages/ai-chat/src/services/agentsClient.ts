import { t } from '@nomi-ai/ui';
/** 编程助手进度客户端：`ai:agents:*` IPC（经 preload 的 window.aiIPC） */
export type AgentKind = 'codex' | 'claude' | 'aider' | 'cline' | 'continue' | 'cursor' | 'gemini';
export type AgentStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'stalled' | 'idle';

export interface AgentWatchSettings {
  enabled: boolean;
  stallMs: number;
  cooldownMs: number;
  osNotify: boolean;
  tools: Record<AgentKind, boolean>;
}

export interface AgentSessionView {
  id: string;
  kind: AgentKind;
  label: string;
  project?: string;
  cwd?: string;
  title: string;
  status: AgentStatus;
  summary?: string;
  alive?: boolean;
  path: string;
  mtime: number;
  updatedAt: number;
}

export interface AgentWatchState {
  settings: AgentWatchSettings;
  sessions: AgentSessionView[];
  detected: AgentKind[];
  lastRemindAt: number;
}

export const AGENT_LABEL: Record<AgentKind, string> = {
  codex: 'Codex CLI',
  claude: 'Claude Code',
  aider: 'Aider',
  cline: 'Cline',
  continue: 'Continue',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  stalled: '可能卡住',
  waiting: '等你回复',
  idle: '已结束',
};

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
  if (!b) throw new Error(t('编程助手监视需要在桌面应用中使用'));
  const r = (await b.invoke(`ai:agents:${method}`, ...args)) as T & {
    __error?: { message: string };
  };
  if (r && typeof r === 'object' && '__error' in r && r.__error) throw new Error(r.__error.message);
  return r;
}
const on = (ch: string, fn: (p: unknown) => void) => bridge()?.on(ch, fn) ?? (() => undefined);

export const agentsClient = {
  available: () => !!bridge(),
  state: () => call<AgentWatchState>('state'),
  setSettings: (
    p: Omit<Partial<AgentWatchSettings>, 'tools'> & {
      tools?: Partial<Record<AgentKind, boolean>>;
    },
  ) => call<AgentWatchSettings>('set-settings', p),
  scan: () => call<AgentWatchState>('scan'),
  onChanged: (fn: () => void) => on('ai:agents:changed', () => fn()),
};
