/**
 * IpcAdapter —— 对 Electron `ipcMain` / `webContents` 的最小抽象。
 *
 * 为什么单独抽出：
 * - 允许在 vitest（Node）里注入 fake adapter，无需真的启动 Electron；
 * - 生产环境注入 `createElectronIpcAdapter()`，把 `ipcMain.handle` / `webContents.send` 直接串起来。
 */

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
  const req = (0, eval)('require');
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
