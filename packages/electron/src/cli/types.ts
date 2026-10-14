/** 编程助手 CLI 接入 · 共享类型（P0） */

export type HarnessBackend = 'nomi' | 'claude' | 'codex';

export type CliKind = 'claude' | 'codex' | 'cursor';

export interface CliInstallInfo {
  kind: CliKind;
  /** 可执行文件路径；未找到时为空 */
  path: string | null;
  /** `cli --version` 解析出的版本 */
  version: string | null;
  /** npm registry latest（可空表示未查到） */
  latest: string | null;
  /** npm | native | unknown */
  installMethod: 'npm' | 'native' | 'unknown';
  /** 是否有可用更新（semver 比较） */
  updateAvailable: boolean;
  /** Cursor 仅检测不更新 */
  updateSupported: boolean;
}

export interface CliProviderProfile {
  id: string;
  /** 所属工具 */
  kind: 'claude' | 'codex';
  name: string;
  baseUrl: string;
  model: string;
  /** 仅存密文引用；界面只见掩码 */
  hasKey: boolean;
  keyHint: string;
  /** 是否当前启用 */
  active: boolean;
}

export interface CliProviderInput {
  id?: string;
  kind: 'claude' | 'codex';
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface HarnessSessionState {
  backend: HarnessBackend;
  cwd: string;
  /** CLI 侧会话 id（resume 用） */
  cliSessionId: string | null;
  /** 当前是否正在跑一轮 */
  busy: boolean;
  /** 检测到 ~/.cc-switch 时的警告 */
  ccSwitchWarning: boolean;
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
