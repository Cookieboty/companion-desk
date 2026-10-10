// dsh 的最小内部抽象层 —— 骨架期专用
//
// 目的：让本 bundle 的所有插件在 P1 尚未接入真实 @deepseek-ai/dsh 时也能独立编译/单测。
// P1 完成后，把本文件的 export 替换为：
//   export type { PluginContext, Waterfall, DefinePluginFn } from '@deepseek-ai/dsh';
// 或改用 TS "type-only re-export" 保持插件源码不变。

/** dsh 事件字符串枚举（占位，覆盖本 bundle 用到的） */
export type DshEvent =
  | 'session/user-message'
  | 'session/assistant-message'
  | 'session/closed'
  | 'agent/pre-request'
  | 'agent/post-final'
  | 'agent/turn-end'
  | 'agent/stopped-by-user'
  | 'agent/regenerate'
  | 'agent/sensory-inject'
  | 'tools/pre-execute'
  | 'tools/post-execute'
  | 'tools/wrap'
  | 'tool/confirm-required'
  | 'tts/chunk'
  | 'tts/end'
  | 'userProfile/changed'
  | 'server:up'
  | 'server:down';

/** Waterfall / hook 上下文（占位；真实由 dsh 提供） */
export interface HookContext<TPayload = unknown> {
  payload: TPayload;
  /** 允许中间件返回 reject 以阻断链路 */
  reject: (reason: string, code?: string) => never;
  /** 记录一次 log */
  log: (level: 'info' | 'warn' | 'error' | 'debug', msg: string, meta?: unknown) => void;
}

export type HookHandler<TPayload = unknown, TResult = void> = (
  ctx: HookContext<TPayload>,
) => TResult | Promise<TResult>;

/** 服务/能力键 —— 类似 InjectionKey */
export interface ServiceKey<T> {
  readonly key: symbol;
  readonly typeMarker?: T; // 仅用于类型推断，不会在运行时出现
}

export function defineService<T>(name: string): ServiceKey<T> {
  return { key: Symbol(name) } as ServiceKey<T>;
}

/** 插件上下文（占位；子集） */
export interface PluginContext {
  /** 订阅 waterfall / hook */
  on<TPayload = unknown, TResult = void>(
    event: DshEvent,
    handler: HookHandler<TPayload, TResult>,
  ): () => void;

  /** 触发事件（内部广播） */
  emit<TPayload = unknown>(event: DshEvent, payload: TPayload): void;

  /** 依赖注入：注册服务 */
  provide<T>(key: ServiceKey<T>, impl: T): void;

  /** 依赖注入：消费服务 */
  inject<T>(key: ServiceKey<T>): T | undefined;

  /** 读取本插件的 patch 配置 */
  config<T = unknown>(): T;

  /** 结构化日志 */
  logger: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
    debug: (msg: string, meta?: unknown) => void;
  };
}

/** 插件定义 */
export interface PluginDefinition<TConfig = unknown> {
  name: string;
  /** 依赖的其他插件 name（可选） */
  requires?: string[];
  apply: (ctx: PluginContext, cfg: TConfig) => void | Promise<void>;
  dispose?: (ctx: PluginContext) => void | Promise<void>;
}

export function definePlugin<TConfig = unknown>(
  def: PluginDefinition<TConfig>,
): PluginDefinition<TConfig> {
  return def;
}
