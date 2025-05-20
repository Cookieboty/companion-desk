// 为Electron IPC通信定义类型
interface ElectronAPI {
  quit: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
  moveWindow: (deltaX: number, deltaY: number) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export { }; 