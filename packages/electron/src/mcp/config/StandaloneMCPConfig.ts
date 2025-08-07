/**
 * MCP服务器配置管理 - Standalone版本
 * 移除了electron依赖，适用于独立node.js环境
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TTSConfig } from '@ig-live/types';

// 语音配置接口
export interface VoiceConfig {
  voiceMode: 'fixed' | 'tts' | 'mixed';
  enableProjectSummary: boolean;
  ttsApiConfig?: {
    hostname: string;
    port: number;
    path: string;
    audioUrl: string;
    promptText: string;
  };
}

// MCP服务器配置接口
export interface MCPServerConfig {
  voice: VoiceConfig;
  maxCallsBeforePrompt: number;
  assetsPath: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MCPServerConfig = {
  voice: {
    voiceMode: 'fixed', // 默认使用系统语音
    enableProjectSummary: true,
    ttsApiConfig: undefined // 不设置默认TTS配置
  },
  maxCallsBeforePrompt: 24,
  assetsPath: 'packages/electron/assets'
};

/**
 * 配置管理器 - Standalone版本
 * 不依赖electron，适用于独立node.js环境
 */
export class StandaloneMCPConfigManager {
  private static instance: StandaloneMCPConfigManager;
  private config: MCPServerConfig;
  private appConfigPath: string;
  private userDataPath: string;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    // 使用系统标准路径，不依赖electron
    this.userDataPath = path.join(os.homedir(), 'Library', 'Application Support', '@ig-live', 'electron');
    this.appConfigPath = path.join(this.userDataPath, 'config.json');
  }

  static getInstance(): StandaloneMCPConfigManager {
    if (!StandaloneMCPConfigManager.instance) {
      StandaloneMCPConfigManager.instance = new StandaloneMCPConfigManager();
    }
    return StandaloneMCPConfigManager.instance;
  }

  /**
   * 加载TTS配置
   */
  private loadTTSConfig(): TTSConfig | null {
    try {
      const ttsConfigPath = path.join(this.userDataPath, 'tts-config.json');
      console.log(`MCP: 尝试读取TTS配置文件: ${ttsConfigPath}`);

      if (fs.existsSync(ttsConfigPath)) {
        const configData = fs.readFileSync(ttsConfigPath, 'utf8');
        const ttsConfig = JSON.parse(configData) as TTSConfig;

        // 验证配置完整性
        if (ttsConfig.enabled &&
          ttsConfig.hostname &&
          ttsConfig.port &&
          ttsConfig.path &&
          ttsConfig.audioUrl &&
          ttsConfig.promptText) {
          console.log('MCP: TTS配置加载成功', {
            hostname: ttsConfig.hostname,
            port: ttsConfig.port,
            enabled: ttsConfig.enabled
          });
          return ttsConfig;
        } else {
          console.log('MCP: TTS配置不完整，忽略');
          return null;
        }
      } else {
        console.log('MCP: TTS配置文件不存在');
        return null;
      }
    } catch (error) {
      console.error('MCP: 读取TTS配置失败:', error);
      return null;
    }
  }

  /**
   * 从应用配置文件加载配置
   */
  loadFromApp(): VoiceConfig {
    try {
      console.log(`MCP: 尝试读取配置文件: ${this.appConfigPath}`);

      if (fs.existsSync(this.appConfigPath)) {
        const configData = fs.readFileSync(this.appConfigPath, 'utf8');
        const appConfig = JSON.parse(configData);

        console.log(`MCP: 配置文件内容: ${JSON.stringify(appConfig, null, 2)}`);

        if (appConfig.voiceSettings?.voiceMode) {
          const newMode = appConfig.voiceSettings.voiceMode;
          console.log(`MCP: 从配置文件读取到voiceMode: ${newMode}`);

          this.config.voice.voiceMode = newMode;
          this.config.voice.enableProjectSummary = appConfig.voiceSettings.enableProjectSummary !== false;

          console.log(`MCP: 动态更新语音模式为: ${this.config.voice.voiceMode}`);
        } else {
          console.log('MCP: 配置文件中没有找到voiceSettings.voiceMode');
        }
      } else {
        console.log(`MCP: 配置文件不存在: ${this.appConfigPath}`);
      }
    } catch (error) {
      console.error('MCP: 读取配置失败:', error);
    }

    // 加载TTS配置
    const ttsConfig = this.loadTTSConfig();
    if (ttsConfig) {
      // 如果有TTS配置且启用，则转换为内部格式
      this.config.voice.ttsApiConfig = {
        hostname: ttsConfig.hostname,
        port: ttsConfig.port,
        path: ttsConfig.path,
        audioUrl: ttsConfig.audioUrl,
        promptText: ttsConfig.promptText
      };

      // 如果TTS配置存在且启用，则优先使用TTS模式
      if (this.config.voice.voiceMode === 'fixed') {
        this.config.voice.voiceMode = 'tts';
        console.log('MCP: 检测到TTS配置，自动切换到TTS模式');
      }
    } else {
      // 没有TTS配置或配置无效，确保使用固定语音模式
      this.config.voice.ttsApiConfig = undefined;
      if (this.config.voice.voiceMode === 'tts') {
        this.config.voice.voiceMode = 'fixed';
        console.log('MCP: 没有TTS配置，自动切换到固定语音模式');
      }
    }

    console.log(`MCP: 最终使用的语音配置: ${JSON.stringify(this.config.voice)}`);
    return this.config.voice;
  }

  /**
   * 获取语音配置
   */
  getVoiceConfig(): VoiceConfig {
    return this.config.voice;
  }

  /**
   * 获取TTS API配置
   */
  getTTSApiConfig() {
    return this.config.voice.ttsApiConfig!;
  }

  /**
   * 获取最大调用次数配置
   */
  getMaxCallsBeforePrompt(): number {
    return this.config.maxCallsBeforePrompt;
  }

  /**
   * 获取资源路径
   */
  getAssetsPath(): string {
    return this.config.assetsPath;
  }

  /**
   * 更新语音模式
   */
  updateVoiceMode(mode: 'fixed' | 'tts' | 'mixed'): void {
    this.config.voice.voiceMode = mode;
    console.log(`MCP: 语音模式已更新为: ${mode}`);
  }

  /**
   * 更新TTS API配置
   */
  updateTTSApiConfig(config: Partial<VoiceConfig['ttsApiConfig']>): void {
    if (this.config.voice.ttsApiConfig) {
      this.config.voice.ttsApiConfig = {
        ...this.config.voice.ttsApiConfig,
        ...config
      };
      console.log(`MCP: TTS API配置已更新:`, this.config.voice.ttsApiConfig);
    }
  }

  /**
   * 重新加载配置（支持热更新）
   */
  reloadConfig(): VoiceConfig {
    console.log('MCP: 重新加载配置...');
    // 重置为默认配置
    this.config = { ...DEFAULT_CONFIG };
    // 重新加载
    return this.loadFromApp();
  }

  /**
   * 检查TTS配置是否可用
   */
  isTTSConfigAvailable(): boolean {
    return !!(this.config.voice.ttsApiConfig &&
      this.config.voice.ttsApiConfig.hostname &&
      this.config.voice.ttsApiConfig.port &&
      this.config.voice.ttsApiConfig.path &&
      this.config.voice.ttsApiConfig.audioUrl &&
      this.config.voice.ttsApiConfig.promptText);
  }

  /**
   * 获取完整配置
   */
  getConfig(): MCPServerConfig {
    return this.config;
  }
}
