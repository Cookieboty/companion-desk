import { mkAiPreload } from '@nomi-ai/ai-sdk-client/preload';
import { contextBridge, ipcRenderer } from 'electron';

// 为 AI 对话窗口注入 window.aiIPC（走 ai-sdk-client 的白名单桥）
mkAiPreload({ contextBridge, ipcRenderer });

// 为AI对话窗口提供的API（仅暴露命名白名单通道，业务走 window.aiIPC）
const aiChatAPI = {
  /** 平台：渲染层据此画一体化标题栏（macOS 红绿灯 / Windows·Linux 原生按钮 overlay） */
  platform: process.platform,

  /**
   * 窗口按钮：抽屉 / 模态打开时 macOS 隐藏红绿灯；Windows / Linux 调暗原生按钮并拦截窗口关闭
   * （拦截时主进程发 close-blocked，渲染层据此关闭最上层抽屉）
   */
  chrome: {
    setButtonsHidden: (hidden: boolean) =>
      ipcRenderer.send('window-chrome:set-buttons-hidden', hidden === true),
    onCloseBlocked: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('window-chrome:close-blocked', h);
      return () => {
        ipcRenderer.removeListener('window-chrome:close-blocked', h);
      };
    },
  },

  /** 设置 → 应用图标（core/appIcon.ts） */
  appIcon: {
    get: () => ipcRenderer.invoke('app-icon:get'),
    set: (variant: string) => ipcRenderer.invoke('app-icon:set', variant),
  },
  /** 设置 → 灵动岛（island/IslandService.ts） */
  island: {
    get: () => ipcRenderer.invoke('island:get'),
    set: (patch: unknown) => ipcRenderer.invoke('island:set', patch),
    test: () => ipcRenderer.invoke('island:test'),
  },

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
