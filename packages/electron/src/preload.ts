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
  }
} as IpcApi); 