import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('quit-app'),
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('set-always-on-top', flag),
  moveWindow: (mouseX: number, mouseY: number) => {
    ipcRenderer.send('window-move', { mouseX, mouseY });
  }
});

// Live2D加载完成后进行设置
window.addEventListener('DOMContentLoaded', () => {
  // 在页面加载完成后执行一些操作
  console.log('Live2D Electron App 已加载');
});  