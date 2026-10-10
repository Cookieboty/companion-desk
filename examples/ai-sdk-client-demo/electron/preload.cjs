/**
 * P7-5 · Electron preload —— 演示如何调用 `mkAiPreload`。
 *
 * 使用打包脚本时通常会引 `@ig-live/ai-sdk-client/preload`；这里为了保持 demo
 * 的可运行性，仅内联最简 assertChannel 逻辑，与仓内实现语义一致。
 * 真实项目请直接：
 *   const { contextBridge, ipcRenderer } = require('electron');
 *   const { mkAiPreload } = require('@ig-live/ai-sdk-client/preload');
 *   mkAiPreload({ contextBridge, ipcRenderer });
 */

const { contextBridge, ipcRenderer } = require('electron');

const AI_CHANNEL_PREFIX = 'ai:';
const AI_CHANNEL_MAX_LEN = 96;

function assertChannel(channel) {
  if (typeof channel !== 'string') throw new TypeError('channel must be string');
  if (!channel.startsWith(AI_CHANNEL_PREFIX)) {
    throw new Error(`[ai-preload] channel '${channel}' 缺少前缀`);
  }
  if (channel.length > AI_CHANNEL_MAX_LEN) {
    throw new Error(`[ai-preload] channel '${channel}' 超过最大长度`);
  }
  if (!/^[A-Za-z0-9_:-]+$/.test(channel)) {
    throw new Error(`[ai-preload] channel '${channel}' 含非法字符`);
  }
}

const listeners = new WeakMap();
const wrap = (fn) => {
  const wrapped = (_event, ...args) => {
    if (args.length <= 1) fn(args[0]);
    else fn(args);
  };
  listeners.set(fn, wrapped);
  return wrapped;
};

const api = {
  invoke(channel, ...args) {
    assertChannel(channel);
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, fn) {
    assertChannel(channel);
    const wrapped = wrap(fn);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
  off(channel, fn) {
    assertChannel(channel);
    const wrapped = listeners.get(fn);
    if (wrapped) ipcRenderer.off(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('aiIPC', api);
