/**
 * 通知服务模块
 * 负责系统通知的显示
 */

import { spawn } from 'child_process';

export type NotificationType = 'voice' | 'sound' | 'notification' | 'all';
export type UrgencyLevel = 'low' | 'normal' | 'high';

export class NotificationService {
  /**
   * 显示系统通知
   */
  async showSystemNotification(message: string, urgency: UrgencyLevel): Promise<void> {
    return new Promise((resolve) => {
      try {
        const title = this.getTitleByUrgency(urgency);

        // macOS
        if (process.platform === 'darwin') {
          spawn('osascript', ['-e', `display notification "${message}" with title "${title}"`]);
        }
        // Windows
        else if (process.platform === 'win32') {
          const script = `New-BurntToastNotification -Text '${title}', '${message}'`;
          spawn('powershell', ['-Command', script]);
        }
        // Linux
        else {
          spawn('notify-send', [title, message]);
        }

        setTimeout(resolve, 100);
      } catch (error) {
        console.error('系统通知失败:', error);
        resolve();
      }
    });
  }

  /**
   * 根据紧急程度获取通知标题
   */
  private getTitleByUrgency(urgency: UrgencyLevel): string {
    switch (urgency) {
      case 'high':
        return '重要通知';
      case 'low':
        return '提示';
      default:
        return '对话完成';
    }
  }

  /**
   * 播放系统通知声音
   */
  async playNotificationSound(urgency: UrgencyLevel = 'normal'): Promise<void> {
    return new Promise((resolve) => {
      try {
        // macOS 系统通知声音
        if (process.platform === 'darwin') {
          const soundFile = this.getMacOSSoundByUrgency(urgency);
          spawn('afplay', [soundFile]);
        }
        // Windows 系统通知声音
        else if (process.platform === 'win32') {
          const soundFile = this.getWindowsSoundByUrgency(urgency);
          spawn('powershell', ['-c', `(New-Object Media.SoundPlayer "${soundFile}").PlaySync()`]);
        }
        // Linux 使用 aplay 或 paplay
        else {
          spawn('paplay', ['/usr/share/sounds/alsa/Front_Left.wav']).on('error', () => {
            spawn('aplay', ['/usr/share/sounds/alsa/Front_Left.wav']);
          });
        }

        setTimeout(resolve, 500);
      } catch (error) {
        console.error('播放通知声音失败:', error);
        resolve();
      }
    });
  }

  /**
   * 获取macOS系统声音文件路径
   */
  private getMacOSSoundByUrgency(urgency: UrgencyLevel): string {
    switch (urgency) {
      case 'high':
        return '/System/Library/Sounds/Sosumi.aiff';
      case 'low':
        return '/System/Library/Sounds/Tink.aiff';
      default:
        return '/System/Library/Sounds/Glass.aiff';
    }
  }

  /**
   * 获取Windows系统声音文件路径
   */
  private getWindowsSoundByUrgency(urgency: UrgencyLevel): string {
    switch (urgency) {
      case 'high':
        return 'C:\\Windows\\Media\\Windows Critical Stop.wav';
      case 'low':
        return 'C:\\Windows\\Media\\Windows Ding.wav';
      default:
        return 'C:\\Windows\\Media\\notify.wav';
    }
  }

  /**
   * 发送完整通知（包含语音、声音、通知）
   */
  async sendCompleteNotification(
    message: string,
    type: NotificationType,
    urgency: UrgencyLevel,
    voiceCallback?: (message: string, urgency: UrgencyLevel) => Promise<boolean>
  ): Promise<void> {
    try {
      console.log(`MCP: 发送${type}类型通知 - ${message} (${urgency})`);

      // 播放语音
      if (type === 'voice' || type === 'all') {
        if (voiceCallback) {
          const voiceSuccess = await voiceCallback(message, urgency);

          // 如果语音播放失败且需要兜底声音，使用系统声音
          if (!voiceSuccess && type === 'all') {
            console.log('MCP: 语音播放失败，使用系统声音作为兜底');
            await this.playNotificationSound(urgency);
          }
        }
      }
      // 如果只要求播放系统声音
      else if (type === 'sound') {
        await this.playNotificationSound(urgency);
      }

      // 显示系统通知
      if (type === 'notification' || type === 'all') {
        await this.showSystemNotification(message, urgency);
      }

    } catch (error) {
      console.error('MCP: 发送通知失败:', error);

      // 最终兜底：如果一切都失败了，至少播放系统声音
      if (type === 'sound' || type === 'voice' || type === 'all') {
        try {
          await this.playNotificationSound(urgency);
        } catch (fallbackError) {
          console.error('MCP: 兜底系统声音也播放失败:', fallbackError);
        }
      }
    }
  }
}