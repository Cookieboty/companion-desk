/** 编程助手 CLI 接入 · 共享类型 */

import type { ClaudeApiFormat, CodexApiFormat, CliApiFormat, DshApiFormat } from './formats';

export type HarnessBackend = 'nomi' | 'claude' | 'codex' | 'dsh';

export type CliKind = 'claude' | 'codex' | 'dsh' | 'cursor';

/** 拥有独立供应商档案库的 CLI */
export type CliProviderKind = 'claude' | 'codex' | 'dsh';

/** 支持版本更新的 CLI */
export type UpdatableCli = 'claude' | 'codex' | 'dsh';

export interface CliInstallInfo {
  kind: CliKind;
  path: string | null;
  version: string | null;
  latest: string | null;
  installMethod: 'npm' | 'native' | 'unknown';
  updateAvailable: boolean;
  updateSupported: boolean;
  /** 运行时问题（目前仅 dsh：PATH 上的 Node 低于 24） */
  runtimeWarning?: { nodeVersion: string | null; required: number } | null;
}

export interface CliProviderProfile {
  id: string;
  kind: CliProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  apiFormat: CliApiFormat;
  /** 非原生格式需要本地路由 */
  needsRouting: boolean;
  hasKey: boolean;
  keyHint: string;
  active: boolean;
}

export interface CliProviderInput {
  id?: string;
  kind: CliProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  apiFormat?: ClaudeApiFormat | CodexApiFormat | DshApiFormat;
  apiKey?: string;
}

export interface HarnessSessionState {
  backend: HarnessBackend;
  cwd: string;
  cliSessionId: string | null;
  busy: boolean;
}

export type HarnessEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'done' | 'error'; detail?: string }
  | { type: 'permission'; id: string; summary: string }
  | { type: 'done'; sessionId?: string; text: string }
  | { type: 'error'; message: string };

export interface HarnessSendResult {
  text: string;
  sessionId: string | null;
  events: HarnessEvent[];
}
