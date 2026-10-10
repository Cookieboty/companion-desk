import type { IpcAdapter, IpcHandler, IpcInvokeEvent, WebContentsLike } from '@ig-live/ai-runtime';

export interface FakeWebContents extends WebContentsLike {
  sent: Array<{ channel: string; payload: unknown }>;
  destroy(): void;
}

export interface FakeIpcAdapter extends IpcAdapter {
  invoke(senderId: number, channel: string, ...args: unknown[]): Promise<unknown>;
  emitTo(senderId: number, channel: string, ...args: unknown[]): void;
  addWebContents(id?: number): FakeWebContents;
  webContents: FakeWebContents[];
  handlers: Map<string, IpcHandler>;
  senderStreams: Map<number, Array<{ channel: string; payload: unknown }>>;
}

export function createFakeIpcAdapter(): FakeIpcAdapter {
  const handlers = new Map<string, IpcHandler>();
  const listeners = new Map<string, Set<(event: IpcInvokeEvent, ...args: unknown[]) => void>>();
  const webContents: FakeWebContents[] = [];
  const senderStreams = new Map<number, Array<{ channel: string; payload: unknown }>>();
  let nextId = 100;

  const makeEvent = (senderId: number): IpcInvokeEvent => ({
    senderId,
    senderUrl: `e2e://sender/${senderId}`,
    send(channel, payload) {
      let bucket = senderStreams.get(senderId);
      if (!bucket) {
        bucket = [];
        senderStreams.set(senderId, bucket);
      }
      bucket.push({ channel, payload });
    },
  });

  const adapter: FakeIpcAdapter = {
    handlers,
    webContents,
    senderStreams,
    handle(channel, handler) {
      if (handlers.has(channel)) throw new Error(`handle already registered: ${channel}`);
      handlers.set(channel, handler);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
    on(channel, listener) {
      let bucket = listeners.get(channel);
      if (!bucket) {
        bucket = new Set();
        listeners.set(channel, bucket);
      }
      bucket.add(listener);
    },
    off(channel, listener) {
      listeners.get(channel)?.delete(listener);
    },
    getAllWebContents() {
      return webContents;
    },
    async invoke(senderId, channel, ...args) {
      const h = handlers.get(channel);
      if (!h) throw new Error(`no handler for ${channel}`);
      return h(makeEvent(senderId), ...args);
    },
    emitTo(senderId, channel, ...args) {
      const bucket = listeners.get(channel);
      if (!bucket) return;
      for (const fn of bucket) fn(makeEvent(senderId), ...args);
    },
    addWebContents(id) {
      const wcId = id ?? nextId++;
      let destroyed = false;
      const wc: FakeWebContents = {
        id: wcId,
        sent: [],
        isDestroyed: () => destroyed,
        send(channel, payload) {
          this.sent.push({ channel, payload });
        },
        destroy() {
          destroyed = true;
        },
      };
      webContents.push(wc);
      return wc;
    },
  };
  return adapter;
}
