/**
 * FakeBridge —— 单元测试用的 IPC 桥内存实现。
 *
 * 契约：
 * - `handle(channel, fn)` 注册一次性 handler；`invoke` 时会命中并 await 其返回值；
 * - `emit(channel, payload)` 会同步派发到所有 `on(channel, …)` 的监听器；
 * - 不依赖 Electron，也不需要真实事件循环，便于在 happy-dom 下跑。
 */

import type { IPCBridge, IpcEventListener, IpcUnsubscribe } from '../src/IPCBridge';

type Handler = (...args: unknown[]) => unknown | Promise<unknown>;

export class FakeBridge implements IPCBridge {
  readonly handlers = new Map<string, Handler>();
  readonly listeners = new Map<string, Set<IpcEventListener>>();
  readonly invokeLog: Array<{ channel: string; args: unknown[] }> = [];

  handle(channel: string, fn: Handler): void {
    this.handlers.set(channel, fn);
  }

  emit(channel: string, payload: unknown): void {
    const bucket = this.listeners.get(channel);
    if (!bucket) return;
    for (const fn of [...bucket]) fn(payload);
  }

  async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    this.invokeLog.push({ channel, args });
    const fn = this.handlers.get(channel);
    if (!fn) throw new Error(`no handler for ${channel}`);
    return (await fn(...args)) as T;
  }

  on<T = unknown>(channel: string, fn: IpcEventListener<T>): IpcUnsubscribe {
    let bucket = this.listeners.get(channel);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(channel, bucket);
    }
    bucket.add(fn as IpcEventListener);
    return () => bucket?.delete(fn as IpcEventListener);
  }

  off<T = unknown>(channel: string, fn: IpcEventListener<T>): void {
    this.listeners.get(channel)?.delete(fn as IpcEventListener);
  }
}
