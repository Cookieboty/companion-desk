// 定义IPC通信接口
export interface IpcApi {
  quit: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
  moveWindow: (deltaX: number, deltaY: number) => void;
  getPosition: () => Promise<[number, number]>;
  setPosition: (x: number, y: number) => void;
  saveModel: (modelName: string) => void;
  getSavedModel: () => Promise<string>;
  getCursorPosition: () => Promise<{ x: number; y: number }>;
  onWindowMouseEnter: (callback: () => void) => void;
  onWindowMouseLeave: (callback: () => void) => void;
  removeWindowMouseListeners: () => void;

  // 语音相关API - 简化后只保留必要的
  getVoiceSettings: () => Promise<VoiceSettings>;
  saveVoiceSettings: (settings: VoiceSettings) => void;

  // TTS配置相关API
  getTTSConfig: () => Promise<TTSConfig | null>;
  saveTTSConfig: (config: TTSConfig) => Promise<void>;
  testTTSConnection: (config: TTSConfig) => Promise<TTSTestResult>;
  resetTTSConfig: () => Promise<void>;

  // 键盘监听API
  startKeyboardListener: () => void;
  stopKeyboardListener: () => void;
  onKeyboardEvent: (callback: (event: KeyboardEvent) => void) => void;
  onKeyboardListenerStarted: (callback: () => void) => void;
  onKeyboardListenerError: (callback: (error: string) => void) => void;
  removeKeyboardListeners: () => void;

  // AI对话相关API
  openAiChat: () => Promise<{ success: boolean; error?: string }>;

  // TTS配置窗口API
  openTTSConfig: () => Promise<{ success: boolean; error?: string }>;

  /** 主进程 → 看板娘指令：{ type: 'motion' | 'expression' | 'parameter', ... } */
  onMascotCommand?: (callback: (cmd: unknown) => void) => () => void;

  /** 模型注册表 / 商店 / 用户导入（主进程实现） */
  models?: import('./models').ModelsApi;
  /** 看板娘窗口互动 */
  mascotWindow?: import('./models').MascotWindowApi;
  /** 桌面能力（确认 / 拖文件总结） */
  desktop?: import('./models').DesktopApi;
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
  voiceMode: 'fixed' | 'tts' | 'mixed';
}

// TTS配置类型定义
export interface TTSConfig {
  enabled: boolean;
  hostname: string;
  port: number;
  path: string;
  audioUrl: string;
  promptText: string;
  lastModified: number;
}

// TTS连接测试结果
export interface TTSTestResult {
  success: boolean;
  message: string;
  latency?: number;
}

export * from './models';
