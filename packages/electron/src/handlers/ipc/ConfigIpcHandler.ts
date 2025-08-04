/**
 * 配置相关IPC处理器
 * 处理应用配置、模型配置等相关的IPC通信
 */

import { app } from 'electron';
import { BaseIpcHandler } from './BaseIpcHandler';
import { ILoggerService } from '../../services/LoggerService';
import { IConfigService, VoiceSettings } from '../../services/ConfigService';

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
        this.logger.error('配置更新失败', { error: error.message, updates });
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
        this.logger.error('配置项更新失败', { error: error.message, key, value });
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
        this.logger.error('配置重新加载失败', { error: error.message });
        return this.createErrorResponse(error);
      }
    });

    // 保存当前模型
    this.registerListener('save-model', (_, modelName: string) => {
      this.validateArgs([modelName], 1, ['string']);

      try {
        this.configService.set('modelName', modelName);
        this.configService.save().catch(error => {
          this.logger.error('保存模型配置失败', { error: error.message });
        });
        this.logger.info('模型配置已保存', { modelName });
      } catch (error) {
        this.logger.error('保存模型配置失败', { error: error.message, modelName });
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
          this.logger.error('保存语音设置失败', { error: error.message });
        });

        this.logger.info('语音设置已保存', { settings: updatedSettings });
      } catch (error) {
        this.logger.error('保存语音设置失败', { error: error.message, settings });
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
        this.logger.error('重置配置失败', { error: error.message });
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
        this.logger.error('配置备份失败', { error: error.message });
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
        this.logger.error('配置验证失败', { error: error.message });
        return {
          isValid: false,
          errors: [error.message]
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
        this.logger.error('配置导出失败', { error: error.message });
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
        this.logger.error('配置导入失败', { error: error.message });
        return this.createErrorResponse(error);
      }
    });

    this.logger.info('ConfigIpcHandler 初始化完成', {
      registeredChannels: this.getRegisteredChannels().length
    });
  }
}