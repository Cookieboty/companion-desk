import { contextBridge, ipcRenderer } from 'electron';
import { mkAiPreload } from '@ig-live/ai-sdk-client/preload';

// 为 AI 对话窗口注入 window.aiIPC（走 ai-sdk-client 的白名单桥）
mkAiPreload({ contextBridge, ipcRenderer });

// 为AI对话窗口提供的API
const aiChatAPI = {
  // 消息相关
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  // 监听事件
  on: (channel: string, callback: Function) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);

    // 返回清理函数
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  // 移除所有监听器
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

// 将API暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', aiChatAPI);

console.log('AI Chat preload script loaded'); 