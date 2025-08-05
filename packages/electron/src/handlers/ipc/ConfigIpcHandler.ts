/**
 * 配置相关IPC处理器
 * 处理应用配置、模型配置等相关的IPC通信
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { BaseIpcHandler } from './BaseIpcHandler';
import { ILoggerService } from '../../services/LoggerService';
import { IConfigService, VoiceSettings } from '../../services/ConfigService';
import { TTSConfig, TTSTestResult } from '@ig-live/types';

export class ConfigIpcHandler extends BaseIpcHandler {
  private configService: IConfigService;

  constructor(logger: ILoggerService, configService: IConfigService) {
    super(logger);
    this.configService = configService;
  }

  /**
   * 初始化配置相关IPC处理器
   */
  initialize(): void {
    // 获取完整配置
    this.registerHandler('get-config', async () => {
      const config = this.configService.getConfig();
      this.logger.debug('获取配置', { config });
      return config;
    });

    // 更新配置
    this.registerHandler('update-config', async (_, updates) => {
      this.validateArgs([updates], 1, ['object']);

      try {
        this.configService.updateConfig(updates);
        await this.configService.save();
        this.logger.info('配置更新成功', { updates });
        return this.createSuccessResponse();
      } catch (error) {
        this.logger.error('配置更新失败', { error: error instanceof Error ? error.message : String(error), updates });
        return this.createErrorResponse(error);
      }
    });

    // 获取特定配置项
    this.registerHandler('get-config-value', async (_, key: string, defaultValue?: any) => {
      this.validateArgs([key], 1, ['string']);

      const value = this.configService.get(key, defaultValue);
      this.logger.debug('获取配置项', { key, value });
      return value;
    });

    // 设置特定配置项
    this.registerHandler('set-config-value', async (_, key: string, value: any) => {
      this.validateArgs([key, value], 2, ['string']);

      try {
        this.configService.set(key, value);
        await this.configService.save();
        this.logger.info('配置项更新成功', { key, value });
        return this.createSuccessResponse();
      } catch (error) {
        this.logger.error('配置项更新失败', { error: error instanceof Error ? error.message : String(error), key, value });
        return this.createErrorResponse(error);
      }
    });

    // 重新加载配置
    this.registerHandler('reload-config', async () => {
      try {
        await this.configService.reload();
        this.logger.info('配置重新加载成功');
        return this.createSuccessResponse();
      } catch (error) {
        this.logger.error('配置重新加载失败', { error: error instanceof Error ? error.message : String(error) });
        return this.createErrorResponse(error);
      }
    });

    // 保存当前模型
    this.registerListener('save-model', (_, modelName: string) => {
      this.validateArgs([modelName], 1, ['string']);

      try {
        this.configService.set('modelName', modelName);
        this.configService.save().catch(error => {
          this.logger.error('保存模型配置失败', { error: error instanceof Error ? error.message : String(error) });
        });
        this.logger.info('模型配置已保存', { modelName });
      } catch (error) {
        this.logger.error('保存模型配置失败', { error: error instanceof Error ? error.message : String(error), modelName });
      }
    });

    // 获取保存的模型
    this.registerHandler('get-saved-model', async () => {
      const modelName = this.configService.get('modelName', '');
      this.logger.debug('获取保存的模型', { modelName });
      return modelName;
    });

    // 获取语音设置
    this.registerHandler('get-voice-settings', async () => {
      const voiceSettings = this.configService.get<VoiceSettings>('voiceSettings');
      this.logger.debug('获取语音设置', { voiceSettings });
      return voiceSettings;
    });

    // 保存语音设置
    this.registerListener('save-voice-settings', (_, settings: VoiceSettings) => {
      this.validateArgs([settings], 1, ['object']);

      try {
        const currentSettings = this.configService.get<VoiceSettings>('voiceSettings');
        const updatedSettings = { ...currentSettings, ...settings };

        this.configService.set('voiceSettings', updatedSettings);
        this.configService.save().catch(error => {
          this.logger.error('保存语音设置失败', { error: error instanceof Error ? error.message : String(error) });
        });

        this.logger.info('语音设置已保存', { settings: updatedSettings });
      } catch (error) {
        this.logger.error('保存语音设置失败', { error: error instanceof Error ? error.message : String(error), settings });
      }
    });

    // 获取应用信息
    this.registerHandler('get-app-info', async () => {
      const appInfo = {
        version: app.getVersion(),
        name: app.getName(),
        userDataPath: app.getPath('userData'),
        isPackaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node
      };

      this.logger.debug('获取应用信息', { appInfo });
      return appInfo;
    });

    // 重置配置为默认值
    this.registerHandler('reset-config', async () => {
      try {
        this.configService.reset();
        await this.configService.save();
        this.logger.info('配置已重置为默认值');
        return this.createSuccessResponse();
      } catch (error) {
        this.logger.error('重置配置失败', { error: error instanceof Error ? error.message : String(error) });
        return this.createErrorResponse(error);
      }
    });

    // 备份配置
    this.registerHandler('backup-config', async () => {
      try {
        const backupPath = await this.configService.backup();
        this.logger.info('配置备份成功', { backupPath });
        return this.createSuccessResponse(backupPath);
      } catch (error) {
        this.logger.error('配置备份失败', { error: error instanceof Error ? error.message : String(error) });
        return this.createErrorResponse(error);
      }
    });

    // 验证配置
    this.registerHandler('validate-config', async (_, config?: any) => {
      try {
        const targetConfig = config || this.configService.getConfig();
        const validation = this.configService.validateConfig(targetConfig);

        this.logger.debug('配置验证结果', { validation });
        return validation;
      } catch (error) {
        this.logger.error('配置验证失败', { error: error instanceof Error ? error.message : String(error) });
        return {
          isValid: false,
          errors: [error instanceof Error ? error.message : String(error)]
        };
      }
    });

    // 获取配置文件路径
    this.registerHandler('get-config-path', async () => {
      const configPath = app.getPath('userData') + '/config.json';
      this.logger.debug('获取配置文件路径', { configPath });
      return configPath;
    });

    // 导出配置
    this.registerHandler('export-config', async () => {
      try {
        const config = this.configService.getConfig();
        const exportData = {
          config,
          timestamp: new Date().toISOString(),
          appVersion: app.getVersion()
        };

        this.logger.info('配置导出成功');
        return this.createSuccessResponse(exportData);
      } catch (error) {
        this.logger.error('配置导出失败', { error: error instanceof Error ? error.message : String(error) });
        return this.createErrorResponse(error);
      }
    });

    // 导入配置
    this.registerHandler('import-config', async (_, importData: any) => {
      this.validateArgs([importData], 1, ['object']);

      try {
        if (!importData.config) {
          throw new Error('导入数据格式错误，缺少config字段');
        }

        // 验证导入的配置
        const validation = this.configService.validateConfig(importData.config);
        if (!validation.isValid) {
          throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
        }

        // 更新配置
        this.configService.updateConfig(importData.config);
        await this.configService.save();

        this.logger.info('配置导入成功', { timestamp: importData.timestamp });
        return this.createSuccessResponse();
      } catch (error) {
        this.logger.error('配置导入失败', { error: error instanceof Error ? error.message : String(error) });
        return this.createErrorResponse(error);
      }
    });

    // TTS配置相关处理器
    this.initializeTTSHandlers();

    this.logger.info('ConfigIpcHandler 初始化完成', {
      registeredChannels: this.getRegisteredChannels().length
    });
  }

  /**
   * 初始化TTS配置相关IPC处理器
   */
  private initializeTTSHandlers(): void {
    const ttsConfigPath = path.join(app.getPath('userData'), 'tts-config.json');

    // 获取TTS配置
    this.registerHandler('getTTSConfig', async () => {
      try {
        if (fs.existsSync(ttsConfigPath)) {
          const configData = fs.readFileSync(ttsConfigPath, 'utf8');
          const config = JSON.parse(configData) as TTSConfig;
          this.logger.debug('获取TTS配置成功', { config });
          return config;
        }
        this.logger.debug('TTS配置文件不存在');
        return null;
      } catch (error) {
        this.logger.error('获取TTS配置失败', { error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    });

    // 保存TTS配置
    this.registerHandler('saveTTSConfig', async (_, config: TTSConfig) => {
      this.validateArgs([config], 1, ['object']);

      try {
        // 验证配置格式
        const validation = this.validateTTSConfig(config);
        if (!validation.isValid) {
          throw new Error(`TTS配置验证失败: ${validation.errors.join(', ')}`);
        }

        // 添加时间戳
        const configWithTimestamp = {
          ...config,
          lastModified: Date.now()
        };

        // 保存到文件
        fs.writeFileSync(ttsConfigPath, JSON.stringify(configWithTimestamp, null, 2), 'utf8');

        this.logger.info('TTS配置保存成功', { config: configWithTimestamp });
        return this.createSuccessResponse();
      } catch (error) {
        this.logger.error('TTS配置保存失败', { error: error instanceof Error ? error.message : String(error), config });
        return this.createErrorResponse(error);
      }
    });

    // 测试TTS连接
    this.registerHandler('testTTSConnection', async (_, config: TTSConfig) => {
      this.validateArgs([config], 1, ['object']);

      try {
        const startTime = Date.now();
        const result = await this.testTTSConnection(config);
        const latency = Date.now() - startTime;

        const testResult: TTSTestResult = {
          ...result,
          latency
        };

        this.logger.info('TTS连接测试完成', { testResult });
        return testResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('TTS连接测试失败', { error: errorMessage, config });

        return {
          success: false,
          message: `连接测试失败: ${errorMessage}`
        } as TTSTestResult;
      }
    });

    // 重置TTS配置
    this.registerHandler('resetTTSConfig', async () => {
      try {
        if (fs.existsSync(ttsConfigPath)) {
          fs.unlinkSync(ttsConfigPath);
          this.logger.info('TTS配置已重置');
        }
        return this.createSuccessResponse();
      } catch (error) {
        this.logger.error('重置TTS配置失败', { error: error instanceof Error ? error.message : String(error) });
        return this.createErrorResponse(error);
      }
    });

    // 测试TTS语音播放
    this.registerHandler('test-tts-voice', async (_, testConfig: TTSConfig & { testText: string }) => {
      this.validateArgs([testConfig], 1, ['object']);

      try {
        // 验证配置
        const validation = this.validateTTSConfig(testConfig);
        if (!validation.isValid) {
          throw new Error(`TTS配置验证失败: ${validation.errors.join(', ')}`);
        }

        // 创建VoiceService实例进行测试
        const { VoiceService } = await import('../../mcp/services/VoiceService');
        const voiceService = new VoiceService();

        // 临时配置TTS设置用于测试
        const { MCPConfigManager } = await import('../../mcp/config/MCPConfig');
        const configManager = MCPConfigManager.getInstance();

        // 备份当前配置
        const originalConfig = configManager.getVoiceConfig();

        try {
          // 临时设置测试配置
          configManager.updateVoiceMode('tts');
          if (configManager.getVoiceConfig().ttsApiConfig) {
            configManager.updateTTSApiConfig({
              hostname: testConfig.hostname,
              port: testConfig.port,
              path: testConfig.path,
              audioUrl: testConfig.audioUrl,
              promptText: testConfig.promptText
            });
          } else {
            // 如果没有现有配置，需要设置完整配置
            const newConfig = { ...configManager.getVoiceConfig() };
            newConfig.ttsApiConfig = {
              hostname: testConfig.hostname,
              port: testConfig.port,
              path: testConfig.path,
              audioUrl: testConfig.audioUrl,
              promptText: testConfig.promptText
            };
            configManager.updateVoiceMode('tts');
          }

          // 执行语音测试
          await voiceService.playTextToSpeech(testConfig.testText);

          this.logger.info('TTS语音测试成功', { testText: testConfig.testText });
          return { success: true, message: '语音测试成功' };

        } finally {
          // 恢复原始配置
          configManager.updateVoiceMode(originalConfig.voiceMode);
          if (originalConfig.ttsApiConfig) {
            configManager.updateTTSApiConfig(originalConfig.ttsApiConfig);
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('TTS语音测试失败', { error: errorMessage, testConfig });

        return {
          success: false,
          message: `语音测试失败: ${errorMessage}`
        };
      }
    });
  }

  /**
   * 验证TTS配置
   */
  private validateTTSConfig(config: TTSConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证hostname
    if (!config.hostname || typeof config.hostname !== 'string') {
      errors.push('hostname是必需的且必须是字符串');
    } else if (config.hostname.trim().length === 0) {
      errors.push('hostname不能为空');
    }

    // 验证port
    if (typeof config.port !== 'number') {
      errors.push('port必须是数字');
    } else if (config.port < 1 || config.port > 65535) {
      errors.push('port必须在1-65535范围内');
    }

    // 验证path
    if (!config.path || typeof config.path !== 'string') {
      errors.push('path是必需的且必须是字符串');
    } else if (!config.path.startsWith('/')) {
      errors.push('path必须以/开头');
    }

    // 验证audioUrl
    if (!config.audioUrl || typeof config.audioUrl !== 'string') {
      errors.push('audioUrl是必需的且必须是字符串');
    } else {
      try {
        const url = new URL(config.audioUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('audioUrl必须是有效的HTTP或HTTPS URL');
        }
      } catch {
        errors.push('audioUrl格式无效');
      }
    }

    // 验证promptText
    if (!config.promptText || typeof config.promptText !== 'string') {
      errors.push('promptText是必需的且必须是字符串');
    } else if (config.promptText.trim().length === 0) {
      errors.push('promptText不能为空');
    } else if (config.promptText.length > 500) {
      errors.push('promptText长度不能超过500字符');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 测试TTS连接
   */
  private async testTTSConnection(config: TTSConfig): Promise<TTSTestResult> {
    return new Promise((resolve) => {
      const protocol = config.hostname.includes('localhost') || config.hostname.includes('127.0.0.1') ? http : https;

      // 构建测试用的请求体
      const testData = JSON.stringify({
        text: "TTS连接测试",
        ref_audio_path: config.audioUrl,
        prompt_text: config.promptText.substring(0, 100) // 截取前100个字符作为测试
      });

      const options = {
        hostname: config.hostname,
        port: config.port,
        path: config.path,
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(testData)
        }
      };

      const req = protocol.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve({
            success: true,
            message: '连接成功，TTS服务可正常访问'
          });
        } else {
          resolve({
            success: false,
            message: `服务器返回状态码: ${res.statusCode}`
          });
        }
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          message: `连接失败: ${error.message}`
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          message: '连接超时'
        });
      });

      // 发送测试数据
      req.write(testData);
      req.end();
    });
  }
}