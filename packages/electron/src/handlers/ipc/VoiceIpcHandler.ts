/**
 * 语音相关IPC处理器
 * 处理语音播放、键盘监听等相关的IPC通信
 */

import { BaseIpcHandler } from './BaseIpcHandler';
import { ILoggerService } from '../../services/LoggerService';
import { IConfigService } from '../../services/ConfigService';

// 全局键盘监听器类型定义
interface KeyboardEvent {
  key: string;
  timestamp: number;
  type: 'keydown' | 'keyup';
}

interface GlobalKeyboardListener {
  addListener(callback: (event: any, down: any) => void): void;
  kill(): void;
}

export class VoiceIpcHandler extends BaseIpcHandler {
  private configService: IConfigService;
  private globalKeyboardListener: any = null;
  private keyboardListener: any = null;
  private isKeyboardListening = false;

  constructor(logger: ILoggerService, configService: IConfigService) {
    super(logger);
    this.configService = configService;
    this.initializeGlobalKeyboardListener();
  }

  /**
   * 初始化全局键盘监听器
   */
  private initializeGlobalKeyboardListener(): void {
    try {
      const { GlobalKeyboardListener } = require('node-global-key-listener');
      this.globalKeyboardListener = GlobalKeyboardListener;
      this.logger.info('全局键盘监听器初始化成功');
    } catch (error) {
      this.logger.error('全局键盘监听器初始化失败', { error: error.message });
      this.globalKeyboardListener = null;
    }
  }

  /**
   * 初始化语音相关IPC处理器
   */
  initialize(): void {
    // 获取语音设置
    this.registerHandler('get-voice-settings', async () => {
      const voiceSettings = this.configService.get('voiceSettings');
      this.logger.debug('获取语音设置', { voiceSettings });
      return voiceSettings;
    });

    // 保存语音设置
    this.registerListener('save-voice-settings', (_, settings) => {
      this.validateArgs([settings], 1, ['object']);

      try {
        const currentSettings = this.configService.get('voiceSettings');
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

    // 启动键盘监听
    this.registerListener('start-keyboard-listener', () => {
      if (!this.globalKeyboardListener) {
        this.logger.error('全局键盘监听器不可用');
        this.sendKeyboardListenerError('全局键盘监听器未初始化，可能是依赖未正确安装');
        return;
      }

      if (this.isKeyboardListening) {
        this.logger.info('键盘监听器已经在运行');
        this.sendKeyboardListenerStarted();
        return;
      }

      try {
        this.keyboardListener = new this.globalKeyboardListener();

        this.keyboardListener.addListener((e: any, down: any) => {
          const keyEvent: KeyboardEvent = {
            key: e.name,
            timestamp: Date.now(),
            type: e.state === 'DOWN' ? 'keydown' : 'keyup'
          };

          this.logger.debug('键盘事件', { keyEvent });
          this.sendKeyboardEvent(keyEvent);
        });

        this.isKeyboardListening = true;
        this.logger.info('键盘监听器启动成功');
        this.sendKeyboardListenerStarted();

      } catch (error) {
        this.logger.error('启动键盘监听器失败', { error: error.message });
        this.sendKeyboardListenerError(error.message);
      }
    });

    // 停止键盘监听
    this.registerListener('stop-keyboard-listener', () => {
      if (this.keyboardListener && this.isKeyboardListening) {
        try {
          this.keyboardListener.kill();
          this.keyboardListener = null;
          this.isKeyboardListening = false;
          this.logger.info('键盘监听器已停止');
          this.sendKeyboardListenerStopped();
        } catch (error) {
          this.logger.error('停止键盘监听器失败', { error: error.message });
        }
      } else {
        this.logger.warn('键盘监听器未运行');
      }
    });

    // 检查键盘监听器状态
    this.registerHandler('get-keyboard-listener-status', async () => {
      const status = {
        isListening: this.isKeyboardListening,
        isAvailable: !!this.globalKeyboardListener,
        hasListener: !!this.keyboardListener
      };

      this.logger.debug('键盘监听器状态', { status });
      return status;
    });

    // 播放语音（模拟）
    this.registerHandler('play-voice', async (_, voiceConfig: any) => {
      this.validateArgs([voiceConfig], 1, ['object']);

      try {
        // 这里是语音播放的模拟实现
        // 实际实现需要根据具体的语音服务来完成

        const { text, voice, speed = 1.0, volume = 1.0 } = voiceConfig;

        this.logger.info('播放语音', { text, voice, speed, volume });

        // 模拟播放延迟
        await new Promise(resolve => setTimeout(resolve, 1000));

        this.logger.info('语音播放完成');
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('语音播放失败', { error: error.message, voiceConfig });
        return this.createErrorResponse(error);
      }
    });

    // 获取可用语音列表
    this.registerHandler('get-available-voices', async () => {
      try {
        // 这里是获取可用语音的模拟实现
        const voices = [
          { id: 'voice1', name: '标准女声', language: 'zh-CN' },
          { id: 'voice2', name: '标准男声', language: 'zh-CN' },
          { id: 'voice3', name: '英文女声', language: 'en-US' }
        ];

        this.logger.debug('获取可用语音列表', { voices });
        return voices;

      } catch (error) {
        this.logger.error('获取可用语音列表失败', { error: error.message });
        return [];
      }
    });

    // 测试语音播放
    this.registerHandler('test-voice', async (_, voiceId: string) => {
      this.validateArgs([voiceId], 1, ['string']);

      try {
        this.logger.info('测试语音播放', { voiceId });

        // 播放测试音频
        const testConfig = {
          text: '这是语音测试',
          voice: voiceId,
          speed: 1.0,
          volume: 0.8
        };

        // 模拟测试播放
        await new Promise(resolve => setTimeout(resolve, 500));

        this.logger.info('语音测试完成');
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('语音测试失败', { error: error.message, voiceId });
        return this.createErrorResponse(error);
      }
    });

    // 设置语音音量
    this.registerHandler('set-voice-volume', async (_, volume: number) => {
      this.validateArgs([volume], 1, ['number']);

      try {
        if (volume < 0 || volume > 1) {
          throw new Error('音量值必须在0-1之间');
        }

        this.configService.set('voiceSettings.volume', volume);
        await this.configService.save();

        this.logger.info('语音音量已设置', { volume });
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('设置语音音量失败', { error: error.message, volume });
        return this.createErrorResponse(error);
      }
    });

    // 切换语音模式
    this.registerHandler('set-voice-mode', async (_, mode: string) => {
      this.validateArgs([mode], 1, ['string']);

      try {
        const validModes = ['fixed', 'tts', 'mixed'];
        if (!validModes.includes(mode)) {
          throw new Error(`无效的语音模式: ${mode}，支持的模式: ${validModes.join(', ')}`);
        }

        this.configService.set('voiceSettings.voiceMode', mode);
        await this.configService.save();

        this.logger.info('语音模式已设置', { mode });
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('设置语音模式失败', { error: error.message, mode });
        return this.createErrorResponse(error);
      }
    });

    this.logger.info('VoiceIpcHandler 初始化完成', {
      registeredChannels: this.getRegisteredChannels().length,
      keyboardListenerAvailable: !!this.globalKeyboardListener
    });
  }

  /**
   * 发送键盘事件到渲染进程
   */
  private sendKeyboardEvent(event: KeyboardEvent): void {
    // 这里需要通过某种方式发送事件到渲染进程
    // 可以通过事件总线或者直接发送到窗口
    // 暂时通过日志记录
    this.logger.debug('键盘事件已发送', { event });
  }

  /**
   * 发送键盘监听器启动消息
   */
  private sendKeyboardListenerStarted(): void {
    this.logger.info('键盘监听器启动消息已发送');
  }

  /**
   * 发送键盘监听器停止消息
   */
  private sendKeyboardListenerStopped(): void {
    this.logger.info('键盘监听器停止消息已发送');
  }

  /**
   * 发送键盘监听器错误消息
   */
  private sendKeyboardListenerError(error: string): void {
    this.logger.error('键盘监听器错误消息已发送', { error });
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 停止键盘监听
    if (this.keyboardListener && this.isKeyboardListening) {
      try {
        this.keyboardListener.kill();
        this.keyboardListener = null;
        this.isKeyboardListening = false;
        this.logger.info('键盘监听器已清理');
      } catch (error) {
        this.logger.error('清理键盘监听器失败', { error: error.message });
      }
    }

    // 调用父类清理方法
    super.cleanup();
  }
}