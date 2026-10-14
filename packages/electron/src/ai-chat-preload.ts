import { mkAiPreload } from '@nomi-ai/ai-sdk-client/preload';
import { contextBridge, ipcRenderer } from 'electron';

// 为 AI 对话窗口注入 window.aiIPC（走 ai-sdk-client 的白名单桥）
mkAiPreload({ contextBridge, ipcRenderer });

// 为AI对话窗口提供的API（仅暴露命名白名单通道，业务走 window.aiIPC）
const aiChatAPI = {
  updates: {
    get: () => ipcRenderer.invoke('updates:get'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    setAutoCheck: (on: boolean) => ipcRenderer.invoke('updates:set-auto-check', on),
    onChanged: (cb: (s: unknown) => void) => {
      const l = (_: unknown, s: unknown) => cb(s);
      ipcRenderer.on('updates:changed', l);
      return () => {
        ipcRenderer.removeListener('updates:changed', l);
      };
    },
  },
};

// 将API暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', aiChatAPI);

console.log('AI Chat preload script loaded');
