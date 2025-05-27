// 定义IPC通信接口
export interface IpcApi {
  quit: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
  moveWindow: (deltaX: number, deltaY: number) => void;
  getPosition: () => Promise<[number, number]>;
  setPosition: (x: number, y: number) => void;
  saveModel: (modelName: string) => void;
  getSavedModel: () => Promise<string>;
  readLocalFile: (filePath: string) => Promise<string | Blob>;
  getCursorPosition: () => Promise<{ x: number; y: number }>;
}

// 在渲染进程中可用的Electron API
export interface ElectronApi {
  electronAPI: IpcApi;
} 