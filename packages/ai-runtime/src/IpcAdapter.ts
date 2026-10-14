/**
 * IpcAdapter —— 对 Electron `ipcMain` / `webContents` 的最小抽象。
 *
 * 为什么单独抽出：
 * - 允许在 vitest（Node）里注入 fake adapter，无需真的启动 Electron；
 * - 生产环境注入 `createElectronIpcAdapter()`，把 `ipcMain.handle` / `webContents.send` 直接串起来。
 */

import { nodeRequire } from './nodeRequire';

export interface IpcInvokeEvent {
  /** 发起窗口的 id；不可信但足以做白名单过滤 */
  senderId: number;
  /** 发起窗口所在 frame 的 url，仅用于日志 */
  senderUrl?: string;
  /** 直接对发送方 send 事件（chunk 通道用） */
  send(channel: string, payload: unknown): void;
}

export type IpcHandler = (event: IpcInvokeEvent, ...args: unknown[]) => unknown | Promise<unknown>;

export interface WebContentsLike {
  id: number;
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

export interface IpcAdapter {
  handle(channel: string, handler: IpcHandler): void;
  removeHandler(channel: string): void;
  on(channel: string, listener: (event: IpcInvokeEvent, ...args: unknown[]) => void): void;
  off(channel: string, listener: (event: IpcInvokeEvent, ...args: unknown[]) => void): void;
  getAllWebContents(): WebContentsLike[];
}

/**
 * 生产环境使用：把 Electron 的 `ipcMain` / `BrowserWindow` 适配成 `IpcAdapter`。
 * 仅在 Electron 主进程可调用（否则 `require('electron')` 会抛错）。
 */
export function createElectronIpcAdapter(): IpcAdapter {
  const req = nodeRequire();
  const { ipcMain, webContents } = req('electron') as {
    ipcMain: {
      handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void;
      removeHandler(channel: string): void;
      on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
      off(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    };
    webContents: {
      getAllWebContents(): Array<{
        id: number;
        isDestroyed(): boolean;
        send(channel: string, payload: unknown): void;
      }>;
    };
  };

  const wrap = (e: {
    sender: {
      id: number;
      getURL?: () => string;
      send(channel: string, payload: unknown): void;
    };
  }): IpcInvokeEvent => ({
    senderId: e.sender.id,
    senderUrl: e.sender.getURL?.(),
    send: (ch, payload) => e.sender.send(ch, payload),
  });

  return {
    handle(channel, handler) {
      ipcMain.handle(channel, async (e, ...args) => handler(wrap(e as never), ...args));
    },
    removeHandler(channel) {
      ipcMain.removeHandler(channel);
    },
    on(channel, listener) {
      ipcMain.on(channel, (e, ...args) => listener(wrap(e as never), ...args));
    },
    off(channel, listener) {
      ipcMain.off(channel, listener as never);
    },
    getAllWebContents() {
      return webContents.getAllWebContents();
    },
  };
}

/**
 * Sender 守卫适配器：包装一个底层 adapter，对每个入站调用（`handle` 请求 / `on` 事件）
 * 先执行 `isSenderAllowed`，拒绝时直接抛错，且不会触达内部 handler。
 *
 * 用途：把同一个 origin 白名单一次性套在 transport / capability / provider / compat /
 * event 订阅等所有 `ai:*` 通道上，避免每个 server 各自实现鉴权导致遗漏。
 */
export function createGuardedIpcAdapter(
  inner: IpcAdapter,
  isSenderAllowed: (event: IpcInvokeEvent, channel: string) => boolean,
): IpcAdapter {
  const deny = (event: IpcInvokeEvent, channel: string): never => {
    throw new Error(`[ai-runtime] sender ${event.senderId} is not allowed for ${channel}`);
  };
  // on/off 必须用同一个包装函数引用，否则 off 无法注销
  const wrappedListeners = new WeakMap<
    (event: IpcInvokeEvent, ...args: unknown[]) => void,
    Map<string, (event: IpcInvokeEvent, ...args: unknown[]) => void>
  >();
  return {
    handle(channel, handler) {
      inner.handle(channel, (event, ...args) =>
        isSenderAllowed(event, channel) ? handler(event, ...args) : deny(event, channel),
      );
    },
    removeHandler(channel) {
      inner.removeHandler(channel);
    },
    on(channel, listener) {
      const wrapped = (event: IpcInvokeEvent, ...args: unknown[]) => {
        if (isSenderAllowed(event, channel)) listener(event, ...args);
      };
      let byChannel = wrappedListeners.get(listener);
      if (!byChannel) {
        byChannel = new Map();
        wrappedListeners.set(listener, byChannel);
      }
      byChannel.set(channel, wrapped);
      inner.on(channel, wrapped);
    },
    off(channel, listener) {
      const byChannel = wrappedListeners.get(listener);
      const wrapped = byChannel?.get(channel);
      if (wrapped) {
        inner.off(channel, wrapped);
        byChannel?.delete(channel);
      }
    },
    getAllWebContents() {
      return inner.getAllWebContents();
    },
  };
}
