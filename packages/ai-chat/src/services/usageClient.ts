/**
 * 用量与计费客户端：`ai:usage:*` IPC（经 preload 的 window.aiIPC）。
 * 类型与主进程 electron/src/usage 的返回结构一一对应（渲染进程不引用主进程代码）。
 */
import { t } from '@nomi-ai/ui';

export type UsageRangeId = 'today' | '7d' | '30d' | '90d';
export type UsageCurrency = 'USD' | 'CNY';
export type UsageRetention = '90d' | '1y' | 'forever';

export interface UsageCustomPrice {
  model: string;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface UsageSettings {
  enabled: boolean;
  readToolLogs: boolean;
  /** 点「刷新」时才拉起官方 CLI 去取额度（claude -p /usage、codex app-server）；关闭后只重读本机已有数据 */
  activeQuotaRefresh: boolean;
  retention: UsageRetention;
  currency: UsageCurrency;
  cnyPerUsd: number;
  customPrices: UsageCustomPrice[];
  clearedAt: number;
  /** 日 / 月预算、单任务提醒线（当前币种金额；0 = 不提醒） */
  dailyBudget: number;
  monthlyBudget: number;
  taskAlert: number;
}

export interface UsageBuiltinPrice extends UsageCustomPrice {
  label?: string;
  note?: string;
}

export interface UsageState {
  settings: UsageSettings;
  detected: string[];
  records: number;
  lastScanAt: number;
  pricing: { date: string; builtin: UsageBuiltinPrice[] };
}

export interface UsageSummary {
  costUsd: number;
  input: number;
  output: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
  calls: number;
  estimatedCalls: number;
  unpriced: Array<{ model: string; tokens: number; calls: number }>;
}

export interface UsageSeriesPoint {
  t: number;
  input: number;
  output: number;
  tokens: number;
  costUsd: number;
  calls: number;
}

export interface UsageBreakdownRow {
  key: string;
  tokens: number;
  input: number;
  output: number;
  costUsd: number;
  calls: number;
  hasUnpriced: boolean;
}

export interface UsageQueryResult {
  range: { id: UsageRangeId; from: number; to: number; bucket: 'hour' | 'day' };
  summary: UsageSummary;
  prev: UsageSummary;
  series: UsageSeriesPoint[];
  bySource: UsageBreakdownRow[];
  byProvider: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
}

export interface UsageHeatDay {
  date: string;
  tokens: number;
  costUsd: number;
  calls: number;
}

export type UsageDetailSort = 'ts' | 'tokens' | 'cost' | 'model' | 'source';

export interface UsageDetailQuery {
  from: number;
  to: number;
  source?: string;
  model?: string;
  session?: string;
  sort?: UsageDetailSort;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface UsageDetailRow {
  key: string;
  ts: number;
  source: string;
  provider: string;
  model: string;
  session?: string;
  project?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  tokens: number;
  /** null = 未定价 */
  costUsd: number | null;
  estimated: boolean;
}

export interface UsageDetailResult {
  rows: UsageDetailRow[];
  total: number;
  summary: UsageSummary;
  facets: { sources: string[]; models: string[]; sessions: Array<{ id: string; label: string }> };
}

/** 订阅额度的一个窗口（例如 5 小时 / 每周） */
export interface UsageQuotaWindow {
  id: string;
  usedPercent: number;
  windowMinutes?: number;
  resetAt?: number;
  /** 重置时间已过：这个百分比是上一个窗口的数据 */
  expired?: boolean;
}

/** 一个工具 / 来源的额度；status = unavailable 时显示「暂未返回可用额度」 */
export interface UsageQuotaEntry {
  id: string;
  label: string;
  /** ok = 有额度；unavailable = 订阅登录但暂未返回；api = API 计费，没有订阅额度 */
  status: 'ok' | 'unavailable' | 'api';
  /** 登录方式（主进程按官方登录状态命令 / 本地配置判断，不读取凭据） */
  auth?: 'subscription' | 'api' | 'unknown';
  windows: UsageQuotaWindow[];
  updatedAt?: number;
  plan?: string;
  /** 这份数字的来源：状态栏快照 / claude /usage / Codex 会话日志 / codex app-server */
  origin?: 'statusline' | 'usage-cmd' | 'session-log' | 'app-server';
  /** 最近一次刷新暂时失败，显示的是更早读到的值 */
  stale?: boolean;
}

/** 某个工具这次刷新的结果（不含任何账号信息） */
export type UsageToolRefresh =
  | { state: 'fresh-local' }
  | { state: 'ok' }
  | { state: 'throttled'; retryInSec: number }
  | { state: 'transient'; reason: string; stale: boolean }
  | { state: 'auth'; reason: string }
  | { state: 'skipped'; reason: 'disabled' | 'not-subscription' };

export interface UsageQuotaRefresh {
  entries: UsageQuotaEntry[];
  tools: Partial<Record<'claude' | 'codex', UsageToolRefresh>>;
}

/** Claude Code 额度来源：用户可选开启的 statusline 快照 */
export interface UsageQuotaHook {
  supported: boolean;
  enabled: boolean;
  hadOwnStatusLine: boolean;
  hasSnapshot: boolean;
  problem?: 'invalid-settings' | 'unsupported-statusline';
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
  if (!b) throw new Error(t('用量统计需要在桌面应用中使用'));
  const r = (await b.invoke(`ai:usage:${method}`, ...args)) as T & {
    __error?: { message: string };
  };
  if (r && typeof r === 'object' && '__error' in r && r.__error) throw new Error(r.__error.message);
  return r;
}

export const usageClient = {
  available: () => !!bridge(),
  state: () => call<UsageState>('state'),
  query: (range: UsageRangeId) => call<UsageQueryResult>('query', range),
  heatmap: () => call<{ days: UsageHeatDay[]; today: string }>('heatmap'),
  details: (q: UsageDetailQuery) => call<UsageDetailResult>('details', q),
  csv: (q: UsageDetailQuery) => call<string>('csv', q),
  setSettings: (p: Partial<UsageSettings>) => call<UsageSettings>('set-settings', p),
  scan: () => call<UsageState & { added: number; files: number }>('scan'),
  clear: () => call<UsageState>('clear'),
  quota: () => call<UsageQuotaEntry[]>('quota'),
  quotaRefresh: () => call<UsageQuotaRefresh>('quota-refresh'),
  quotaHook: () => call<UsageQuotaHook>('quota-hook'),
  setQuotaHook: (enabled: boolean) => call<UsageQuotaHook>('quota-hook-set', enabled),
  onChanged: (fn: () => void) => bridge()?.on('ai:usage:changed', () => fn()) ?? (() => undefined),
};

/** 来源 → 展示名（Nomi 对话 / 各编程工具 / 其他） */
export const USAGE_SOURCE_LABEL: Record<string, string> = {
  nomi: 'Nomi 对话',
  claude: 'Claude Code',
  codex: 'Codex',
  dsh: 'dsh',
  gemini: 'Gemini CLI',
  aider: 'Aider',
  cline: 'Cline',
  continue: 'Continue',
  cursor: 'Cursor',
  other: '其他供应商',
};
