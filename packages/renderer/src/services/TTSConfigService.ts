/**
 * TTS配置服务
 * 封装TTS配置的IPC通信和本地状态管理
 */

import { TTSConfig, TTSTestResult } from '@ig-live/types';

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      getTTSConfig: () => Promise<TTSConfig | null>;
      saveTTSConfig: (config: TTSConfig) => Promise<void>;
      testTTSConnection: (config: TTSConfig) => Promise<TTSTestResult>;
      resetTTSConfig: () => Promise<void>;
    };
  }
}

export class TTSConfigService {
  private static instance: TTSConfigService;
  private currentConfig: TTSConfig | null = null;
  private listeners: Set<(config: TTSConfig | null) => void> = new Set();

  private constructor() { }

  /**
   * 获取服务实例（单例模式）
   */
  public static getInstance(): TTSConfigService {
    if (!TTSConfigService.instance) {
      TTSConfigService.instance = new TTSConfigService();
    }
    return TTSConfigService.instance;
  }

  /**
   * 添加配置变更监听器
   */
  public addConfigListener(listener: (config: TTSConfig | null) => void): void {
    this.listeners.add(listener);
  }

  /**
   * 移除配置变更监听器
   */
  public removeConfigListener(listener: (config: TTSConfig | null) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * 通知所有监听器配置已变更
   */
  private notifyListeners(config: TTSConfig | null): void {
    this.listeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        console.error('TTS配置监听器执行失败:', error);
      }
    });
  }

  /**
   * 加载TTS配置
   */
  public async loadConfig(): Promise<TTSConfig | null> {
    try {
      const config = await window.electronAPI.getTTSConfig();
      this.currentConfig = config;
      this.notifyListeners(config);
      return config;
    } catch (error) {
      console.error('加载TTS配置失败:', error);
      this.currentConfig = null;
      this.notifyListeners(null);
      return null;
    }
  }

  /**
   * 保存TTS配置
   */
  public async saveConfig(config: TTSConfig): Promise<void> {
    try {
      // 验证配置
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
      }

      // 保存到主进程
      await window.electronAPI.saveTTSConfig(config);

      // 更新本地状态
      this.currentConfig = { ...config, lastModified: Date.now() };
      this.notifyListeners(this.currentConfig);
    } catch (error) {
      console.error('保存TTS配置失败:', error);
      throw error;
    }
  }

  /**
   * 测试TTS连接
   */
  public async testConnection(config: TTSConfig): Promise<TTSTestResult> {
    try {
      return await window.electronAPI.testTTSConnection(config);
    } catch (error) {
      console.error('测试TTS连接失败:', error);
      return {
        success: false,
        message: `测试失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 重置TTS配置
   */
  public async resetConfig(): Promise<void> {
    try {
      await window.electronAPI.resetTTSConfig();
      this.currentConfig = null;
      this.notifyListeners(null);
    } catch (error) {
      console.error('重置TTS配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  public getCurrentConfig(): TTSConfig | null {
    return this.currentConfig;
  }

  /**
   * 验证配置格式
   */
  public validateConfig(config: TTSConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证hostname
    if (!config.hostname || typeof config.hostname !== 'string') {
      errors.push('服务器地址是必需的');
    } else if (config.hostname.trim().length === 0) {
      errors.push('服务器地址不能为空');
    } else {
      // 简单的域名/IP格式验证
      const hostPattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/;
      if (!hostPattern.test(config.hostname.trim())) {
        errors.push('服务器地址格式无效');
      }
    }

    // 验证port
    if (typeof config.port !== 'number') {
      errors.push('端口必须是数字');
    } else if (!Number.isInteger(config.port)) {
      errors.push('端口必须是整数');
    } else if (config.port < 1 || config.port > 65535) {
      errors.push('端口必须在1-65535范围内');
    }

    // 验证path
    if (!config.path || typeof config.path !== 'string') {
      errors.push('请求路径是必需的');
    } else if (!config.path.startsWith('/')) {
      errors.push('请求路径必须以/开头');
    }

    // 验证audioUrl
    if (!config.audioUrl || typeof config.audioUrl !== 'string') {
      errors.push('音频URL是必需的');
    } else {
      try {
        const url = new URL(config.audioUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('音频URL必须是有效的HTTP或HTTPS地址');
        }
      } catch {
        errors.push('音频URL格式无效');
      }
    }

    // 验证promptText
    if (!config.promptText || typeof config.promptText !== 'string') {
      errors.push('提示文本是必需的');
    } else if (config.promptText.trim().length === 0) {
      errors.push('提示文本不能为空');
    } else if (config.promptText.length > 500) {
      errors.push('提示文本长度不能超过500字符');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 创建默认配置
   */
  public createDefaultConfig(): TTSConfig {
    return {
      enabled: true,
      hostname: '',
      port: 8443,
      path: '/voice_clone_direct',
      audioUrl: '',
      promptText: '这是一段测试语音，用于验证TTS服务是否正常工作。',
      lastModified: Date.now()
    };
  }

  /**
   * 检查配置是否完整
   */
  public isConfigComplete(config: TTSConfig | null): boolean {
    if (!config) return false;

    return !!(
      config.hostname &&
      config.port &&
      config.path &&
      config.audioUrl &&
      config.promptText
    );
  }

  /**
   * 获取配置状态描述
   */
  public getConfigStatus(config: TTSConfig | null): {
    status: 'none' | 'incomplete' | 'complete';
    message: string;
  } {
    if (!config) {
      return {
        status: 'none',
        message: '未配置TTS服务，将使用系统语音'
      };
    }

    if (!this.isConfigComplete(config)) {
      return {
        status: 'incomplete',
        message: '配置不完整，请补充必要信息'
      };
    }

    return {
      status: 'complete',
      message: '配置完成，TTS服务可用'
    };
  }

  /**
   * 导出配置（用于备份）
   */
  public exportConfig(): string | null {
    if (!this.currentConfig) return null;

    return JSON.stringify({
      config: this.currentConfig,
      exportTime: new Date().toISOString(),
      version: '1.0'
    }, null, 2);
  }

  /**
   * 导入配置（从备份恢复）
   */
  public async importConfig(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);

      if (!data.config) {
        throw new Error('导入数据格式错误');
      }

      const validation = this.validateConfig(data.config);
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
      }

      await this.saveConfig(data.config);
    } catch (error) {
      console.error('导入配置失败:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const ttsConfigService = TTSConfigService.getInstance();