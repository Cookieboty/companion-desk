import { contextBridge, ipcRenderer } from 'electron';
import { IpcApi } from '@ig-live/types';

// 向渲染进程暴露安全的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 退出应用
  quit: () => {
    ipcRenderer.send('quit-app');
  },
  // 设置窗口置顶
  setAlwaysOnTop: (flag: boolean) => {
    ipcRenderer.send('set-always-on-top', flag);
  },
  // 移动窗口
  moveWindow: (deltaX: number, deltaY: number) => {
    ipcRenderer.send('move-window', deltaX, deltaY);
  },
  // 获取窗口位置
  getPosition: async () => {
    return await ipcRenderer.invoke('get-position');
  },
  // 设置窗口位置
  setPosition: (x: number, y: number) => {
    try {
      // 确保参数是数字并转为整数
      const intX = Math.round(Number(x) || 0);
      const intY = Math.round(Number(y) || 0);
      ipcRenderer.send('set-position', intX, intY);
    } catch (err) {
      console.error('设置位置参数错误:', err);
    }
  },
  // 保存当前模型
  saveModel: (modelName: string) => {
    ipcRenderer.send('save-model', modelName);
  },
  // 获取保存的模型
  getSavedModel: async () => {
    return await ipcRenderer.invoke('get-saved-model');
  },
  // 读取本地文件
  readLocalFile: async (filePath: string) => {
    return await ipcRenderer.invoke('read-local-file', filePath);
  },
  // 获取鼠标位置
  getCursorPosition: async () => {
    return await ipcRenderer.invoke('get-cursor-position');
  },
  // 监听窗口鼠标事件
  onWindowMouseEnter: (callback: () => void) => {
    ipcRenderer.on('window-mouse-enter', callback);
  },
  onWindowMouseLeave: (callback: () => void) => {
    ipcRenderer.on('window-mouse-leave', callback);
  },
  // 移除窗口鼠标事件监听
  removeWindowMouseListeners: () => {
    ipcRenderer.removeAllListeners('window-mouse-enter');
    ipcRenderer.removeAllListeners('window-mouse-leave');
  },

  // 语音相关API - 简化后只保留必要的
  getVoiceSettings: async () => {
    return await ipcRenderer.invoke('get-voice-settings');
  },
  saveVoiceSettings: (settings: any) => {
    ipcRenderer.send('save-voice-settings', settings);
  },

  // 键盘监听API
  startKeyboardListener: () => {
    ipcRenderer.send('start-keyboard-listener');
  },
  stopKeyboardListener: () => {
    ipcRenderer.send('stop-keyboard-listener');
  },
  onKeyboardEvent: (callback: (event: any) => void) => {
    // 移除之前的监听器，避免重复注册
    ipcRenderer.removeAllListeners('keyboard-event');

    ipcRenderer.on('keyboard-event', (_, event) => {
      try {
        callback(event);
      } catch (error) {
        console.error('preload: 回调函数执行失败:', error);
      }
    });
  },
  onKeyboardListenerStarted: (callback: () => void) => {
    ipcRenderer.on('keyboard-listener-started', callback);
  },
  onKeyboardListenerError: (callback: (error: string) => void) => {
    ipcRenderer.on('keyboard-listener-error', (_, error) => callback(error));
  },
  removeKeyboardListeners: () => {
    ipcRenderer.removeAllListeners('keyboard-event');
    ipcRenderer.removeAllListeners('keyboard-listener-started');
    ipcRenderer.removeAllListeners('keyboard-listener-error');
  }
} as IpcApi); 