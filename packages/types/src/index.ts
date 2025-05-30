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
  onWindowMouseEnter: (callback: () => void) => void;
  onWindowMouseLeave: (callback: () => void) => void;
  removeWindowMouseListeners: () => void;

  // 语音相关API - 简化后只保留必要的
  getVoiceSettings: () => Promise<VoiceSettings>;
  saveVoiceSettings: (settings: VoiceSettings) => void;

  // 键盘监听API
  startKeyboardListener: () => void;
  stopKeyboardListener: () => void;
  onKeyboardEvent: (callback: (event: KeyboardEvent) => void) => void;
  onKeyboardListenerStarted: (callback: () => void) => void;
  onKeyboardListenerError: (callback: (error: string) => void) => void;
  removeKeyboardListeners: () => void;
}

// 在渲染进程中可用的Electron API
export interface ElectronApi {
  electronAPI: IpcApi;
}

// 语音相关类型定义
export interface VoiceContribute {
  keywords: string[];
  voices: string[];
}

export interface VoiceConfig {
  contributes: VoiceContribute[];
}

export interface KeyboardEvent {
  key: string;
  timestamp: number;
  type: 'keydown' | 'keyup';
}

export interface VoiceSettings {
  enabled: boolean;
  volume: number;
  keyboardListening: boolean;
  timeAnnouncement: boolean;
  voicePackPath: string;
} 