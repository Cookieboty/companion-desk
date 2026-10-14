/**
 * 语音相关IPC处理器
 * 处理语音播放、键盘监听等相关的IPC通信
 */

import * as path from 'path';

import { type WebContents } from 'electron';

import { t } from '../../i18n';
import { isTrustedSenderUrl } from '../../security/ipcSenderGuard';
import { type IConfigService } from '../../services/ConfigService';
import { type ILoggerService } from '../../services/LoggerService';
import {
  ensureKeyServerExecutable,
  getKeyServerConfig,
  type KeyServerConfig,
} from '../../utils/keyServerPaths';

import { BaseIpcHandler } from './BaseIpcHandler';

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
  private keyServerConfig: KeyServerConfig | undefined;
  private isKeyboardListening = false;
  // 键盘监听只能由受信窗口启动，事件仅回推给该窗口；窗口关闭后自动停止
  private keyboardOwner: WebContents | null = null;

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
      // 打包后 key server 可执行文件位于 app.asar.unpacked（见 electron-builder asarUnpack）
      const packageDir = path.dirname(require.resolve('node-global-key-listener/package.json'));
      this.keyServerConfig = getKeyServerConfig(packageDir);
      if (!ensureKeyServerExecutable(this.keyServerConfig))
        this.logger.warn('key server 不可执行，全局按键监听可能不可用');
      this.globalKeyboardListener = GlobalKeyboardListener;
      this.logger.info('全局键盘监听器初始化成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('全局键盘监听器初始化失败', { error: errorMessage });
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
        const currentSettings = this.configService.get('voiceSettings') || {};
        const updatedSettings = { ...currentSettings, ...settings };

        this.configService.set('voiceSettings', updatedSettings);
        this.configService.save().catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error('保存语音设置失败', { error: errorMessage });
        });

        this.logger.info('语音设置已保存', { settings: updatedSettings });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('保存语音设置失败', { error: errorMessage, settings });
      }
    });

    // 启动键盘监听
    this.registerListener('start-keyboard-listener', (event) => {
      if (!isTrustedSenderUrl(event.senderFrame?.url ?? event.sender.getURL())) {
        this.logger.warn('拒绝不受信窗口启动键盘监听');
        return;
      }

      if (!this.globalKeyboardListener) {
        this.logger.error('全局键盘监听器不可用');
        this.sendKeyboardListenerError(
          event.sender,
          t('全局键盘监听器未初始化，可能是依赖未正确安装'),
        );
        return;
      }

      if (this.isKeyboardListening) {
        this.logger.info('键盘监听器已经在运行');
        this.sendKeyboardListenerStarted(event.sender);
        return;
      }

      try {
        const owner = event.sender;
        this.keyboardListener = new this.globalKeyboardListener(this.keyServerConfig);

        const started = this.keyboardListener.addListener((e: any, down: any) => {
          const keyEvent: KeyboardEvent = {
            key: e.name,
            timestamp: Date.now(),
            type: e.state === 'DOWN' ? 'keydown' : 'keyup',
          };

          this.sendKeyboardEvent(owner, keyEvent);
        });
        // 原生 key server 启动失败（无权限 / macOS 未授予辅助功能权限）是异步拒绝，不能变成未处理的 rejection
        Promise.resolve(started).catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn('全局键盘监听不可用', { error: errorMessage });
          this.isKeyboardListening = false;
          this.keyboardListener = null;
          this.keyboardOwner = null;
          this.sendKeyboardListenerError(owner, errorMessage);
        });

        this.isKeyboardListening = true;
        this.keyboardOwner = owner;
        // 发起窗口关闭后必须立刻结束原生监听，避免遗留键盘记录进程
        owner.once('destroyed', () => {
          if (this.keyboardOwner === owner) this.stopKeyboardListener();
        });
        this.logger.info('键盘监听器启动成功');
        this.sendKeyboardListenerStarted(owner);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('启动键盘监听器失败', { error: errorMessage });
        this.sendKeyboardListenerError(event.sender, errorMessage);
      }
    });

    // 停止键盘监听
    this.registerListener('stop-keyboard-listener', (event) => {
      if (!isTrustedSenderUrl(event.senderFrame?.url ?? event.sender.getURL())) {
        this.logger.warn('拒绝不受信窗口停止键盘监听');
        return;
      }

      if (this.keyboardListener && this.isKeyboardListening) {
        this.stopKeyboardListener();
        this.sendKeyboardListenerStopped(event.sender);
      } else {
        this.logger.warn('键盘监听器未运行');
      }
    });

    // 检查键盘监听器状态
    this.registerHandler('get-keyboard-listener-status', async () => {
      const status = {
        isListening: this.isKeyboardListening,
        isAvailable: !!this.globalKeyboardListener,
        hasListener: !!this.keyboardListener,
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
        await new Promise((resolve) => setTimeout(resolve, 1000));

        this.logger.info('语音播放完成');
        return this.createSuccessResponse();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('语音播放失败', { error: errorMessage, voiceConfig });
        return this.createErrorResponse(error);
      }
    });

    // 获取可用语音列表
    this.registerHandler('get-available-voices', async () => {
      try {
        // 这里是获取可用语音的模拟实现
        const voices = [
          { id: 'voice1', name: t('标准女声'), language: 'zh-CN' },
          { id: 'voice2', name: t('标准男声'), language: 'zh-CN' },
          { id: 'voice3', name: t('英文女声'), language: 'en-US' },
        ];

        this.logger.debug('获取可用语音列表', { voices });
        return voices;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取可用语音列表失败', { error: errorMessage });
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
          text: t('这是语音测试'),
          voice: voiceId,
          speed: 1.0,
          volume: 0.8,
        };

        // 模拟测试播放
        await new Promise((resolve) => setTimeout(resolve, 500));

        this.logger.info('语音测试完成');
        return this.createSuccessResponse();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('语音测试失败', { error: errorMessage, voiceId });
        return this.createErrorResponse(error);
      }
    });

    // 设置语音音量
    this.registerHandler('set-voice-volume', async (_, volume: number) => {
      this.validateArgs([volume], 1, ['number']);

      try {
        if (volume < 0 || volume > 1) {
          throw new Error(t('音量值必须在0-1之间'));
        }

        this.configService.set('voiceSettings.volume', volume);
        await this.configService.save();

        this.logger.info('语音音量已设置', { volume });
        return this.createSuccessResponse();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('设置语音音量失败', { error: errorMessage, volume });
        return this.createErrorResponse(error);
      }
    });

    // 切换语音模式
    this.registerHandler('set-voice-mode', async (_, mode: string) => {
      this.validateArgs([mode], 1, ['string']);

      try {
        const validModes = ['fixed', 'tts', 'mixed'];
        if (!validModes.includes(mode)) {
          throw new Error(t('无效的语音模式: {0}，支持的模式: {1}', mode, validModes.join(', ')));
        }

        this.configService.set('voiceSettings.voiceMode', mode);
        await this.configService.save();

        this.logger.info('语音模式已设置', { mode });
        return this.createSuccessResponse();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('设置语音模式失败', { error: errorMessage, mode });
        return this.createErrorResponse(error);
      }
    });

    this.logger.info('VoiceIpcHandler 初始化完成', {
      registeredChannels: this.getRegisteredChannels().length,
      keyboardListenerAvailable: !!this.globalKeyboardListener,
    });
  }

  /**
   * 停止原生键盘监听（供停止通道、owner 窗口销毁、cleanup 复用）
   */
  private stopKeyboardListener(): void {
    if (!this.keyboardListener) return;
    try {
      this.keyboardListener.kill();
      this.logger.info('键盘监听器已停止');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('停止键盘监听器失败', { error: errorMessage });
    } finally {
      this.keyboardListener = null;
      this.keyboardOwner = null;
      this.isKeyboardListening = false;
    }
  }

  /**
   * 发送键盘事件到发起窗口
   */
  private sendKeyboardEvent(target: WebContents, event: KeyboardEvent): void {
    if (!target.isDestroyed()) target.send('keyboard-event', event);
  }

  /**
   * 发送键盘监听器启动消息
   */
  private sendKeyboardListenerStarted(target: WebContents): void {
    if (!target.isDestroyed()) target.send('keyboard-listener-started');
  }

  /**
   * 发送键盘监听器停止消息
   */
  private sendKeyboardListenerStopped(target: WebContents): void {
    if (!target.isDestroyed()) target.send('keyboard-listener-stopped');
  }

  /**
   * 发送键盘监听器错误消息
   */
  private sendKeyboardListenerError(target: WebContents, error: string): void {
    if (!target.isDestroyed()) target.send('keyboard-listener-error', error);
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.stopKeyboardListener();

    // 调用父类清理方法
    super.cleanup();
  }
}
