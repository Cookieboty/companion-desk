import { contextBridge, ipcRenderer } from 'electron';
import { IpcApi } from '@ig-live/types';
import { mkAiPreload } from '@ig-live/ai-sdk-client/preload';

// 挂载 ai IPC 桥：`window.aiIPC.invoke/on/off` 走白名单校验的 `ai:` 通道。
// 与旧 `electronAPI` 并存；ai-sdk-client 的 ClientAIClient 会自动查找 `window.aiIPC`。
mkAiPreload({ contextBridge, ipcRenderer });

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

  // 自定义图片相关API
  selectImageFile: async () => {
    return await ipcRenderer.invoke('select-image-file');
  },
  saveCustomImage: async (sourcePath: string) => {
    return await ipcRenderer.invoke('save-custom-image', sourcePath);
  },
  getCustomImage: async () => {
    return await ipcRenderer.invoke('get-custom-image');
  },
  deleteCustomImage: async () => {
    return await ipcRenderer.invoke('delete-custom-image');
  },

  // 显示模式配置相关API
  getDisplayModeConfig: async () => {
    return await ipcRenderer.invoke('get-display-mode-config');
  },
  saveDisplayModeConfig: async (config: any) => {
    return await ipcRenderer.invoke('save-display-mode-config', config);
  },
  getCurrentMode: async () => {
    return await ipcRenderer.invoke('get-current-mode');
  },
  setCurrentMode: async (mode: string) => {
    return await ipcRenderer.invoke('set-current-mode', mode);
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
  },

  // 通用invoke方法，用于调用主进程的IPC处理器
  invoke: async (channel: string, ...args: any[]) => {
    return await ipcRenderer.invoke(channel, ...args);
  },

  // AI对话相关API
  openAiChat: async () => {
    return await ipcRenderer.invoke('open-ai-chat');
  },

  // TTS配置相关API
  openTTSConfig: async () => {
    return await ipcRenderer.invoke('open-tts-config');
  },
  getTTSConfig: async () => {
    return await ipcRenderer.invoke('getTTSConfig');
  },
  saveTTSConfig: async (config: any) => {
    return await ipcRenderer.invoke('saveTTSConfig', config);
  },
  testTTSConnection: async (config: any) => {
    return await ipcRenderer.invoke('testTTSConnection', config);
  },
  resetTTSConfig: async () => {
    return await ipcRenderer.invoke('resetTTSConfig');
  },

  // MCP集成相关API
  mcp: {
    // 获取MCP服务状态
    getStatus: async () => {
      return await ipcRenderer.invoke('mcp:getStatus');
    },
    // 获取MCP诊断信息
    getDiagnostics: async () => {
      return await ipcRenderer.invoke('mcp:getDiagnostics');
    },
    // 调用MCP工具
    callTool: async (toolName: string, args: any) => {
      return await ipcRenderer.invoke('mcp:callTool', toolName, args);
    },
    // 读取MCP资源
    readResource: async (uri: string) => {
      return await ipcRenderer.invoke('mcp:readResource', uri);
    },
    // 获取可用MCP工具列表
    getAvailableTools: async () => {
      return await ipcRenderer.invoke('mcp:getAvailableTools');
    },
    // 获取可用MCP资源列表
    getAvailableResources: async () => {
      return await ipcRenderer.invoke('mcp:getAvailableResources');
    },
    // 重启MCP服务
    restart: async () => {
      return await ipcRenderer.invoke('mcp:restart');
    },
    // 验证MCP配置
    validateConfiguration: async () => {
      return await ipcRenderer.invoke('mcp:validateConfiguration');
    },
    // 设置Cursor MCP集成
    setupCursorIntegration: async () => {
      return await ipcRenderer.invoke('mcp:setupCursorIntegration');
    }
  }
} as IpcApi); 