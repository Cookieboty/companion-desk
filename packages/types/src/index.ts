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

  // 通用invoke方法
  invoke: (channel: string, ...args: any[]) => Promise<any>;

  // AI对话相关API
  openAiChat: () => Promise<{ success: boolean; error?: string }>;

  // MCP集成相关API
  mcp: MCPApi;
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

// ==================== MCP相关类型定义 ====================

/**
 * MCP API接口
 */
export interface MCPApi {
  getStatus: () => Promise<MCPServiceStatus>;
  getDiagnostics: () => Promise<MCPDiagnostics>;
  callTool: (toolName: string, args: any) => Promise<MCPToolResult>;
  readResource: (uri: string) => Promise<any>;
  getAvailableTools: () => Promise<MCPTool[]>;
  getAvailableResources: () => Promise<MCPResource[]>;
  restart: () => Promise<{ success: boolean; error?: string }>;
  validateConfiguration: () => Promise<MCPConfigValidationResult>;
}

/**
 * MCP服务状态
 */
export interface MCPServiceStatus {
  isRunning: boolean;
  mcpServerReady: boolean;
  cursorIntegrationReady: boolean;
  availableToolsCount: number;
  availableResourcesCount: number;
  lastCheck: number;
  error?: string;
}

/**
 * MCP诊断信息
 */
export interface MCPDiagnostics {
  status: MCPServiceStatus;
  cursorIntegration: any;
  systemInfo: {
    platform: string;
    nodeVersion: string;
    electronVersion: string;
    chromeVersion: string;
    pid: number;
    workingDirectory: string;
    timestamp: number;
  };
  environment: {
    NODE_ENV?: string;
    CHARACTER_MODEL_PATH?: string;
    VOICE_ENGINE?: string;
    PERFORMANCE_MODE?: string;
  };
  error?: string;
}

/**
 * MCP工具
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * MCP资源
 */
export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * MCP工具调用结果
 */
export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

/**
 * MCP配置验证结果
 */
export interface MCPConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 3D角色响应接口
 */
export interface Character3DResponse {
  animation?: string;
  expression?: string;
  speech?: string;
  gesture?: string;
  lookAt?: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * MCP工具执行结果
 */
export interface MCPToolExecutionResult {
  success: boolean;
  content: string;
  metadata?: {
    timestamp: number;
    duration?: number;
    characterResponse?: Character3DResponse;
    [key: string]: any;
  };
  error?: string;
} 