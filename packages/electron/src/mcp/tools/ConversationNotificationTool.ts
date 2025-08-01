import { BaseAdapter } from './BaseAdapter';
import * as path from 'path';

/**
 * 对话通知工具
 * 在Cursor IDE对话完成后发送语音或视觉提示
 */
export class ConversationNotificationTool extends BaseAdapter {
  constructor() {
    super(
      'conversation-notification',
      '在Cursor IDE对话完成后发送语音或视觉提示',
      '1.0.0'
    );
    console.log('ConversationNotificationTool: 工具已创建');
  }

  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['voice', 'sound', 'visual', 'all'],
          default: 'voice',
          description: '通知类型'
        },
        message: {
          type: 'string',
          default: '对话已完成',
          description: '通知消息内容'
        },
        urgency: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          default: 'normal',
          description: '紧急程度'
        },
        customSound: {
          type: 'string',
          description: '自定义声音文件路径'
        }
      },
      required: []
    };
  }

  async execute(args: any): Promise<any> {
    const {
      type = 'voice',
      message = '对话已完成',
      urgency = 'normal',
      customSound = null
    } = args;

    try {
      console.log('ConversationNotificationTool: 发送对话完成通知');

      const result = {
        success: true,
        notificationType: type,
        message,
        timestamp: new Date().toISOString()
      };

      switch (type) {
        case 'voice':
          await this.playVoiceNotification(message, urgency);
          break;

        case 'sound':
          await this.playSoundNotification(customSound || this.getDefaultSound(urgency));
          break;

        case 'visual':
          await this.showVisualNotification(message, urgency);
          break;

        case 'all':
          await Promise.all([
            this.playVoiceNotification(message, urgency),
            this.playSoundNotification(this.getDefaultSound(urgency)),
            this.showVisualNotification(message, urgency)
          ]);
          break;

        default:
          throw new Error(`不支持的通知类型: ${type}`);
      }

      // 记录通知历史
      await this.logNotification(result);

      return result;
    } catch (error) {
      console.error('ConversationNotificationTool: 执行失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 播放语音通知
   */
  private async playVoiceNotification(message: string, urgency: string): Promise<void> {
    try {
      console.log(`ConversationNotificationTool: 播放语音通知 - ${message}`);

      // 根据紧急程度调整语音参数
      const voiceParams = this.getVoiceParams(urgency);

      // 通过TTS引擎生成语音
      const audioResult = await this.generateSpeech(message, voiceParams);

      if (audioResult.success) {
        // 播放生成的语音
        await this.playAudio(audioResult.audioPath);

        // 清理临时文件
        setTimeout(() => {
          this.cleanupAudioFile(audioResult.audioPath);
        }, 5000);
      }
    } catch (error) {
      console.error('ConversationNotificationTool: 语音通知失败:', error);
    }
  }

  /**
   * 播放声音通知
   */
  private async playSoundNotification(soundPath: string): Promise<void> {
    try {
      console.log(`ConversationNotificationTool: 播放声音通知 - ${soundPath}`);
      await this.playAudio(soundPath);
    } catch (error) {
      console.error('ConversationNotificationTool: 声音通知失败:', error);
    }
  }

  /**
   * 显示视觉通知
   */
  private async showVisualNotification(message: string, urgency: string): Promise<void> {
    try {
      console.log(`ConversationNotificationTool: 显示视觉通知 - ${message}`);

      // 创建系统通知
      const { Notification } = await import('electron');

      const notification = new Notification({
        title: '3D虚拟助手',
        body: message,
        icon: this.getNotificationIcon(urgency),
        urgency: urgency as any,
        timeoutType: 'default'
      });

      notification.show();

      // 同时在3D角色上显示消息气泡
      await this.show3DCharacterMessage(message, urgency);
    } catch (error) {
      console.error('ConversationNotificationTool: 视觉通知失败:', error);
    }
  }

  /**
   * 在3D角色上显示消息
   */
  private async show3DCharacterMessage(message: string, urgency: string): Promise<void> {
    try {
      // 通过IPC发送消息到渲染进程
      const { BrowserWindow } = await import('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];

      if (mainWindow) {
        mainWindow.webContents.send('character-message', {
          message,
          urgency,
          type: 'conversation-complete',
          duration: this.getMessageDuration(urgency)
        });
      }
    } catch (error) {
      console.error('ConversationNotificationTool: 3D角色消息失败:', error);
    }
  }

  /**
   * 生成语音
   */
  private async generateSpeech(text: string, params: VoiceParams): Promise<any> {
    try {
      // 使用系统TTS或集成的语音合成服务
      const ttsResult = await this.callTTSService(text, params);
      return ttsResult;
    } catch (error) {
      console.error('ConversationNotificationTool: 语音生成失败:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 调用TTS服务
   */
  private async callTTSService(text: string, params: VoiceParams): Promise<any> {
    // 这里可以集成多种TTS服务
    // 例如：Azure Cognitive Services, Google Cloud TTS, Amazon Polly 等

    // 简单的系统TTS实现
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // macOS系统语音
      if (process.platform === 'darwin') {
        const command = `say "${text}" --voice="${params.voice}" --rate=${params.rate}`;
        await execAsync(command);
        return { success: true, method: 'system-tts' };
      }

      // Windows系统语音
      if (process.platform === 'win32') {
        const command = `powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text}')"`;
        await execAsync(command);
        return { success: true, method: 'system-tts' };
      }

      return { success: false, error: '不支持的操作系统' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 播放音频文件
   */
  private async playAudio(audioPath: string): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      if (process.platform === 'darwin') {
        await execAsync(`afplay "${audioPath}"`);
      } else if (process.platform === 'win32') {
        await execAsync(`powershell -Command "(New-Object Media.SoundPlayer '${audioPath}').PlaySync()"`);
      }
    } catch (error) {
      console.error('ConversationNotificationTool: 音频播放失败:', error);
    }
  }

  /**
   * 获取语音参数
   */
  private getVoiceParams(urgency: string): VoiceParams {
    switch (urgency) {
      case 'high':
        return { voice: 'Alex', rate: 220, pitch: 1.2 };
      case 'low':
        return { voice: 'Samantha', rate: 160, pitch: 0.9 };
      default:
        return { voice: 'Ava', rate: 190, pitch: 1.0 };
    }
  }

  /**
   * 获取默认声音
   */
  private getDefaultSound(urgency: string): string {
    const soundMap = {
      'high': '/System/Library/Sounds/Glass.aiff',
      'normal': '/System/Library/Sounds/Purr.aiff',
      'low': '/System/Library/Sounds/Tink.aiff'
    };

    return soundMap[urgency as keyof typeof soundMap] || soundMap['normal'];
  }

  /**
   * 获取通知图标
   */
  private getNotificationIcon(urgency: string): string {
    // 返回不同紧急程度的图标路径
    return path.join(__dirname, '..', '..', 'assets', `notification-${urgency}.png`);
  }

  /**
   * 获取消息显示时长
   */
  private getMessageDuration(urgency: string): number {
    switch (urgency) {
      case 'high': return 8000;
      case 'low': return 3000;
      default: return 5000;
    }
  }

  /**
   * 记录通知历史
   */
  private async logNotification(result: any): Promise<void> {
    try {
      const logEntry = {
        ...result,
        id: this.generateId(),
        source: 'conversation-notification-tool'
      };

      // 这里可以记录到文件或数据库
      console.log('ConversationNotificationTool: 通知记录:', logEntry);
    } catch (error) {
      console.error('ConversationNotificationTool: 记录失败:', error);
    }
  }

  /**
   * 清理音频文件
   */
  private async cleanupAudioFile(filePath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      await fs.unlink(filePath);
    } catch (error) {
      // 忽略清理错误
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// 类型定义
interface VoiceParams {
  voice: string;
  rate: number;
  pitch: number;
}

export default ConversationNotificationTool;