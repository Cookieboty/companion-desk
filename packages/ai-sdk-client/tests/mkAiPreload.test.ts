import { describe, expect, it, vi } from 'vitest';

import {
  assertChannel,
  AI_CHANNEL_MAX_LEN,
  AI_CHANNEL_PREFIX,
  mkAiPreload,
} from '../src/preload/mkAiPreload';

describe('mkAiPreload · assertChannel 白名单', () => {
  it('接受合法 ai: 前缀短通道', () => {
    expect(() => assertChannel('ai:chat:stream')).not.toThrow();
    expect(() => assertChannel('ai:event')).not.toThrow();
  });

  it('拒绝无前缀或错前缀', () => {
    expect(() => assertChannel('chat:stream')).toThrowError(/前缀/);
    expect(() => assertChannel('window:reload')).toThrowError(/前缀/);
    expect(() => assertChannel(`${AI_CHANNEL_PREFIX}!oops`)).toThrowError(/非法字符/);
  });

  it('拒绝超长通道', () => {
    const long = 'ai:' + 'x'.repeat(AI_CHANNEL_MAX_LEN);
    expect(() => assertChannel(long)).toThrowError(/最大长度/);
  });

  it('拒绝非字符串输入', () => {
    // 强制传非法类型以覆盖 typeof 校验
    expect(() => assertChannel(123 as unknown as string)).toThrowError();
    expect(() => assertChannel(undefined as unknown as string)).toThrowError();
  });
});

describe('mkAiPreload · exposeInMainWorld', () => {
  const makeMocks = () => {
    const contextBridge = { exposeInMainWorld: vi.fn() };
    const listeners: Array<(event: unknown, ...args: unknown[]) => void> = [];
    const ipcRenderer = {
      invoke: vi.fn(async (_channel: string, ...args: unknown[]) => args[0]),
      on: vi.fn((_channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        listeners.push(listener);
      }),
      off: vi.fn((_channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      }),
    };
    return { contextBridge, ipcRenderer, listeners };
  };

  it('挂到 window 的默认 key 是 aiIPC，并暴露 invoke/on/off', () => {
    const { contextBridge, ipcRenderer } = makeMocks();
    const api = mkAiPreload({ contextBridge, ipcRenderer });
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('aiIPC', api);
    expect(typeof api.invoke).toBe('function');
    expect(typeof api.on).toBe('function');
    expect(typeof api.off).toBe('function');
  });

  it('invoke 走通道白名单校验', async () => {
    const { contextBridge, ipcRenderer } = makeMocks();
    const api = mkAiPreload({ contextBridge, ipcRenderer, bridgeName: 'testBridge' });
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('testBridge', api);
    await expect(api.invoke('ai:chat:abort', 'r1')).resolves.toBe('r1');
    expect(() => api.invoke('nope:x', 'y')).toThrowError(/前缀/);
  });

  it('on 会包装 listener 剥掉 IpcRendererEvent 参数', () => {
    const { contextBridge, ipcRenderer, listeners } = makeMocks();
    const api = mkAiPreload({ contextBridge, ipcRenderer });
    const received: unknown[] = [];
    const unsub = api.on('ai:event', (p) => received.push(p));
    // 模拟 electron ipcRenderer 触发：第一个参数是 event，后面才是数据
    listeners[0]?.({}, { evt: 'agent:step', data: { step: 1 } });
    expect(received).toEqual([{ evt: 'agent:step', data: { step: 1 } }]);
    unsub();
    expect(ipcRenderer.off).toHaveBeenCalledTimes(1);
  });

  it('off 显式调用可移除监听', () => {
    const { contextBridge, ipcRenderer } = makeMocks();
    const api = mkAiPreload({ contextBridge, ipcRenderer });
    const fn = () => undefined;
    api.on('ai:event', fn);
    api.off('ai:event', fn);
    expect(ipcRenderer.off).toHaveBeenCalledTimes(1);
  });
});
