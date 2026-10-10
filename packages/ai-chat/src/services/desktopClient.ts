/**
 * 桌面能力（文件授权 / 工具权限 / 审计 / 撤销）客户端：`ai:desktop:*` IPC（经 preload 的 window.aiIPC）。
 * 授权文件夹一律由主进程弹出系统选择框，渲染层无法直接传入路径授权。
 */
export type Danger = 'read' | 'write' | 'destructive';
export type Policy = 'always' | 'session' | 'ask';

export interface ScopeView {
  id: string;
  path: string;
  mode: 'read' | 'read-write';
  kind: 'folder' | 'file';
  grantedAt: number;
  session?: boolean;
}

export interface DesktopState {
  scopes: ScopeView[];
  policies: Record<string, Policy>;
  localOnly: boolean;
  cloudAcked: string[];
  tools: Array<{ name: string; danger: Danger; policy: Policy; locked?: boolean }>;
}

export interface AuditEntryView {
  ts: number;
  tool: string;
  args: Record<string, unknown>;
  decision: string;
  result: string;
  ms?: number;
  source?: string;
  provider?: string;
}

export interface JournalView {
  id: string;
  ts: number;
  tool: string;
  summary: string;
  undone: boolean;
}

export interface DesktopSummaryEvent {
  name: string;
  path: string;
  summary: string;
  at: number;
}

interface AiBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, fn: (payload: unknown) => void) => () => void;
}

function bridge(): AiBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const b = (window as unknown as { aiIPC?: AiBridge }).aiIPC;
  return b && typeof b.invoke === 'function' ? b : undefined;
}

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const b = bridge();
  if (!b) throw new Error('桌面能力需要在桌面应用中使用');
  return (await b.invoke(`ai:desktop:${method}`, ...args)) as T;
}

const on = (ch: string, fn: (p: unknown) => void) => bridge()?.on(ch, fn) ?? (() => undefined);

export const desktopClient = {
  available: () => !!bridge(),
  state: () => call<DesktopState>('state'),
  grant: (mode: 'read' | 'read-write') => call<ScopeView | null>('grant', mode),
  revoke: (id: string) => call<boolean>('revoke', id),
  setPolicy: (tool: string, policy: Policy) => call<boolean>('set-policy', tool, policy),
  setLocalOnly: (v: boolean) => call<boolean>('set-local-only', v),
  resetCloudAcks: () => call<boolean>('reset-cloud-acks'),
  audit: (limit = 200) => call<AuditEntryView[]>('audit', limit),
  clearAudit: () => call<boolean>('audit-clear'),
  journal: () => call<JournalView[]>('journal'),
  undoLast: () => call<{ ok: boolean; undone?: string; error?: string }>('undo-last'),
  resetAll: () => call<boolean>('reset-all'),
  onChanged: (fn: (s: DesktopState) => void) =>
    on('ai:desktop:changed', (p) => fn(p as DesktopState)),
  onOpenPanel: (fn: () => void) => on('ai:desktop:open-panel', () => fn()),
  onSummary: (fn: (e: DesktopSummaryEvent) => void) =>
    on('ai:desktop:summary', (p) => fn(p as DesktopSummaryEvent)),
};

export const TOOL_LABELS: Record<string, string> = {
  desktop_request_scope: '请求授权文件夹',
  fs_list: '列出文件夹',
  fs_stat: '查看文件信息',
  fs_search: '搜索文件',
  fs_read_text: '读取文件文本',
  fs_summarize: '总结文件',
  fs_write_text: '写入文本文件',
  fs_trash: '移到回收站',
  undo_last: '撤销上一步',
  grant_scope: '授权文件夹',
  revoke_scope: '撤销授权',
  drop_summarize: '拖到看板娘总结',
};

export const DANGER_LABELS: Record<Danger, string> = {
  read: '只读',
  write: '写入',
  destructive: '破坏性',
};
export const POLICY_LABELS: Record<Policy, string> = {
  always: '总是允许',
  session: '每次运行首次询问',
  ask: '每次都询问',
};
