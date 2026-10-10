/**
 * IPCBridge —— 渲染进程可用的极简 IPC 抽象。
 *
 * 之所以自己抽一层：
 * - preload 里 `contextBridge.exposeInMainWorld('aiIPC', ...)` 暴露的对象要能被
 *   React 侧的 `ClientAIClient` 消费；
 * - 抽象成 interface 后，测试里可以直接 mock，无需拉起 Electron；
 * - 允许业务侧自定义 bridge（例如 WebWorker / iframe postMessage）。
 *
 * 与 preload 的对齐：`mkAiPreload` 会创建一个实现本接口的对象，通过 contextBridge
 * 暴露到 `window[bridgeName]`。
 */

/** IPC unsubscribe */
export type IpcUnsubscribe = () => void;

/** 事件监听器：接收一个 payload（渲染层不关心 IpcRendererEvent） */
export type IpcEventListener<T = unknown> = (payload: T) => void;

export interface IPCBridge {
  /** 发起一次 request/response 调用；对应主进程 `ipcMain.handle`。 */
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  /** 订阅事件通道；返回反订阅函数。 */
  on<T = unknown>(channel: string, fn: IpcEventListener<T>): IpcUnsubscribe;
  /** 显式反订阅（可选；`on` 返回值已提供闭合方案）。 */
  off?<T = unknown>(channel: string, fn: IpcEventListener<T>): void;
}

/**
 * 从全局 window 获取 bridge。默认从 `window.aiIPC` 读取；允许自定义 key
 * 以便 renderer / ai-chat 各挂各的（例如 waifu 侧用 `waifuAiIPC`）。
 */
export function getGlobalBridge(bridgeName = 'aiIPC'): IPCBridge {
  const g = globalThis as unknown as Record<string, unknown>;
  const bridge = g[bridgeName] as IPCBridge | undefined;
  if (!bridge) {
    throw new Error(
      `[ai-sdk-client] window.${bridgeName} 未就绪；请确认 preload 已执行 mkAiPreload('${bridgeName}')`,
    );
  }
  return bridge;
}
