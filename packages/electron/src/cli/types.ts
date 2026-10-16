/** 编程助手 CLI 接入 · 共享类型 */

import type {
  ClaudeApiFormat,
  CodexApiFormat,
  CliApiFormat,
  DshApiFormat,
  GrokApiFormat,
} from './formats';

export type HarnessBackend = 'nomi' | 'claude' | 'codex' | 'dsh' | 'grok';

export type CliKind = 'claude' | 'codex' | 'dsh' | 'grok' | 'cursor';

/** 拥有独立供应商档案库的 CLI */
export type CliProviderKind = 'claude' | 'codex' | 'dsh' | 'grok';

/** 支持版本更新的 CLI */
export type UpdatableCli = 'claude' | 'codex' | 'dsh' | 'grok';

export interface CliInstallInfo {
  kind: CliKind;
  path: string | null;
  version: string | null;
  latest: string | null;
  installMethod: 'npm' | 'native' | 'unknown';
  updateAvailable: boolean;
  updateSupported: boolean;
  /** 可在应用内一键安装（未安装时）：Claude Code / Codex / dsh / Grok */
  installSupported?: boolean;
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
  /** 来自哪个预设模板（品牌图标 / 来源提示）；自定义为 'custom' */
  presetId?: string;
}

export interface CliProviderInput {
  id?: string;
  kind: CliProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  apiFormat?: ClaudeApiFormat | CodexApiFormat | DshApiFormat | GrokApiFormat;
  apiKey?: string;
  presetId?: string;
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
  | {
      type: 'tool';
      name: string;
      status: 'start' | 'done' | 'error';
      /** claude / dsh / grok：调用 id；codex：命令行 */
      detail?: string;
      /** 调用 id（codex 等 detail 不是 id 的后端） */
      id?: string;
      /** 参数（已裁剪的 JSON 或文本）；start 事件带，部分后端在结果事件里补 */
      input?: string;
      /** 工具输出（已裁剪） */
      output?: string;
      /** 子代理内部的调用：指向父工具调用 id */
      parentId?: string;
      /** 主进程收到该事件的时间（ms） */
      at?: number;
    }
  | { type: 'thinking'; text: string; at?: number }
  | { type: 'permission'; id: string; summary: string }
  | { type: 'done'; sessionId?: string; text: string }
  | { type: 'error'; message: string };

export interface HarnessSendResult {
  text: string;
  sessionId: string | null;
  events: HarnessEvent[];
}

/** 标签运行状态 */
export type HarnessTabStatus = 'idle' | 'queued' | 'running' | 'error';

export interface HarnessTabMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  error?: boolean;
  tools?: string[];
  /** 本轮工具调用 / 思考的结构化轨迹（会话视图据此渲染分组、diff、耗时） */
  trace?: HarnessTraceEvent[];
}

/** 持久化到消息里的轨迹事件：HarnessEvent 里的 tool / thinking */
export type HarnessTraceEvent = Extract<HarnessEvent, { type: 'tool' | 'thinking' }>;

/**
 * 对话标签：绑定后端 + CLI 会话 + 工作目录。
 * id 为 'main' 的标签即原有对话（可为 Nomi 或任一 CLI，消息存于 Nomi 历史）；
 * 其它标签只绑定 CLI 后端，消息存于 harness/tabs/<id>.json。
 */
export interface HarnessTabMeta {
  id: string;
  title: string;
  backend: HarnessBackend;
  cwd: string;
  cliSessionId: string | null;
  status: HarnessTabStatus;
  unread: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export interface HarnessTabsState {
  tabs: HarnessTabMeta[];
  activeTabId: string;
  maxConcurrent: number;
  running: number;
  queued: number;
}

/** 安装 / 更新位置：global = npm 全局目录；user = 用户目录（~/.local，不需要管理员权限） */
export type CliInstallScope = 'global' | 'user';

export interface CliRequirement {
  id: 'node' | 'npm' | 'write';
  ok: boolean;
  label: string;
  detail: string;
}

/** 点「安装 / 更新」确认框里展示的计划：确切命令、前置检查、阻塞原因 */
export interface CliInstallPlan {
  kind: UpdatableCli;
  mode: 'install' | 'update';
  scope: CliInstallScope;
  argv: string[];
  /** 展示用的完整命令行 */
  command: string;
  requirements: CliRequirement[];
  /** 非空表示不能执行（原因已本地化） */
  blockers: string[];
  /** 全局目录没有写权限时，可改用的用户目录方案（不用 sudo） */
  userScopeCommand?: string;
}

export interface CliRunResult {
  ok: boolean;
  log: string;
  version: string | null;
  path?: string | null;
  /** 补充提示（例如装到了 ~/.local/bin 但它不在 PATH 上） */
  note?: string;
}

/** 安装 / 更新任务快照（主进程按端点持有；界面重新挂载时先取它） */
export interface CliJobSnapshot {
  kind: 'claude' | 'codex' | 'dsh' | 'grok';
  mode: 'install' | 'update';
  scope: 'global' | 'user';
  status: 'running' | 'done' | 'error';
  argv: string[];
  command: string;
  lines: string[];
  startedAt: number;
  finishedAt?: number;
  result?: CliRunResult;
}
