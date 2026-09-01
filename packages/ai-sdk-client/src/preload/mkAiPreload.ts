/**
 * mkAiPreload —— 在 Electron preload 脚本里把 ai IPC 桥暴露到 `window[bridgeName]`。
 *
 * 对齐 P7 计划 §P7-4：
 * - 强制 `ai:` 前缀 + 长度上限，避免渲染层通过 preload 发起任意 IPC；
 * - 事件 `on` 返回 unsubscribe，同时兼容显式 `off`；
 * - 通过 `electronModule` 参数注入 `contextBridge / ipcRenderer`，避免直接静态引 `electron`
 *   （测试 & lint 友好；packaging 阶段调用方传入真实模块）。
 *
 * 使用示例（在 preload.ts 中）：
 * ```ts
 * import { contextBridge, ipcRenderer } from 'electron';
 * import { mkAiPreload } from '@ig-live/ai-sdk-client/preload';
 * mkAiPreload({ contextBridge, ipcRenderer });
 * ```
 */

export const AI_CHANNEL_PREFIX = 'ai:' as const;
export const AI_CHANNEL_MAX_LEN = 96;

/**
 * 断言通道名合法：必须以 `ai:` 开头，且总长 ≤ 96；只允许 ASCII 字母/数字/`_-:`。
 * 抛错时把非法通道名一并暴露，方便定位。
 */
export function assertChannel(channel: string): void {
  if (typeof channel !== 'string') {
    throw new TypeError(`[ai-preload] channel must be string, got ${typeof channel}`);
  }
  if (!channel.startsWith(AI_CHANNEL_PREFIX)) {
    throw new Error(`[ai-preload] channel '${channel}' 缺少前缀 '${AI_CHANNEL_PREFIX}'`);
  }
  if (channel.length > AI_CHANNEL_MAX_LEN) {
    throw new Error(
      `[ai-preload] channel '${channel}' 超过最大长度 ${AI_CHANNEL_MAX_LEN}`,
    );
  }
  if (!/^[A-Za-z0-9_:-]+$/.test(channel)) {
    throw new Error(`[ai-preload] channel '${channel}' 含非法字符`);
  }
}

export interface PreloadIpcRendererLike {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => unknown;
  off?: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => unknown;
  removeListener?: (
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ) => unknown;
}

export interface PreloadContextBridgeLike {
  exposeInMainWorld: (apiKey: string, api: unknown) => void;
}

export interface MkAiPreloadOptions {
  contextBridge: PreloadContextBridgeLike;
  ipcRenderer: PreloadIpcRendererLike;
  /** 挂到 window 上的 key，默认 `aiIPC` */
  bridgeName?: string;
}

/**
 * 生成并挂载 ai IPC 桥；返回被暴露的对象引用（供测试断言）。
 */
export function mkAiPreload(opts: MkAiPreloadOptions): {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (
    channel: string,
    fn: (payload: unknown) => void,
  ) => () => void;
  off: (channel: string, fn: (payload: unknown) => void) => void;
} {
  const bridgeName = opts.bridgeName ?? 'aiIPC';
  const listenerMap = new WeakMap<
    (payload: unknown) => void,
    (event: unknown, ...args: unknown[]) => void
  >();

  const wrap = (fn: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, ...args: unknown[]) => {
      // preload 惯例：payload 走 args[0]。若上层 `send` 传多个参数，也一起交给上层。
      if (args.length <= 1) fn(args[0]);
      else fn(args);
    };
    listenerMap.set(fn, wrapped);
    return wrapped;
  };

  const removeListener = (channel: string, wrapped: (...a: unknown[]) => void) => {
    const target =
      opts.ipcRenderer.off ??
      opts.ipcRenderer.removeListener ??
      (() => {
        /* no-op: 部分环境不支持显式移除 */
      });
    target.call(opts.ipcRenderer, channel, wrapped as never);
  };

  const api = {
    invoke: (channel: string, ...args: unknown[]) => {
      assertChannel(channel);
      return opts.ipcRenderer.invoke(channel, ...args);
    },
    on: (channel: string, fn: (payload: unknown) => void) => {
      assertChannel(channel);
      const wrapped = wrap(fn);
      opts.ipcRenderer.on(channel, wrapped);
      return () => removeListener(channel, wrapped);
    },
    off: (channel: string, fn: (payload: unknown) => void) => {
      assertChannel(channel);
      const wrapped = listenerMap.get(fn);
      if (wrapped) removeListener(channel, wrapped);
    },
  };

  opts.contextBridge.exposeInMainWorld(bridgeName, api);
  return api;
}
