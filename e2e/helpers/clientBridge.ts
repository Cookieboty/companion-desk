import type { IPCBridge, IpcEventListener, IpcUnsubscribe } from '@ig-live/ai-sdk-client';

import type { FakeIpcAdapter, FakeWebContents } from './fakeIpc';

export interface ClientBridgeHandle {
  bridge: IPCBridge;
  dispose(): void;
}

export function makeClientBridge(
  adapter: FakeIpcAdapter,
  webContents: FakeWebContents,
): ClientBridgeHandle {
  const senderId = webContents.id;
  const localListeners = new Map<string, Set<IpcEventListener>>();
  let disposed = false;

  const emitFromMain = (channel: string, payload: unknown): void => {
    const bucket = localListeners.get(channel);
    if (!bucket) return;
    for (const fn of [...bucket]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[e2e-bridge] renderer listener for '${channel}' threw`, err);
      }
    }
  };

  const originalSend = webContents.send.bind(webContents);
  webContents.send = ((channel: string, payload: unknown) => {
    originalSend(channel, payload);
    if (disposed) return;
    emitFromMain(channel, payload);
  }) as FakeWebContents['send'];

  const bridge: IPCBridge = {
    async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      if (disposed) throw new Error('[e2e-bridge] bridge already disposed');
      const result = await adapter.invoke(senderId, channel, ...args);

      const streams = adapter.senderStreams.get(senderId);
      if (streams && streams.length > 0) {
        while (streams.length > 0) {
          const evt = streams.shift();
          if (!evt) break;
          emitFromMain(evt.channel, evt.payload);
        }
      }
      return result as T;
    },
    on<T = unknown>(channel: string, fn: IpcEventListener<T>): IpcUnsubscribe {
      let bucket = localListeners.get(channel);
      if (!bucket) {
        bucket = new Set();
        localListeners.set(channel, bucket);
      }
      bucket.add(fn as IpcEventListener);
      return () => bucket?.delete(fn as IpcEventListener);
    },
    off<T = unknown>(channel: string, fn: IpcEventListener<T>): void {
      localListeners.get(channel)?.delete(fn as IpcEventListener);
    },
  };

  return {
    bridge,
    dispose() {
      if (disposed) return;
      disposed = true;
      localListeners.clear();
      webContents.destroy();
    },
  };
}
