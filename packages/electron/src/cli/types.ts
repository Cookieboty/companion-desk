/** 编程助手 CLI 接入 · 共享类型 */

import type { ClaudeApiFormat, CodexApiFormat, CliApiFormat } from './formats';

export type HarnessBackend = 'nomi' | 'claude' | 'codex' | 'dsh';

export type CliKind = 'claude' | 'codex' | 'dsh' | 'cursor';

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
}

export interface CliProviderProfile {
  id: string;
  kind: 'claude' | 'codex';
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
  kind: 'claude' | 'codex';
  name: string;
  baseUrl: string;
  model: string;
  apiFormat?: ClaudeApiFormat | CodexApiFormat;
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
