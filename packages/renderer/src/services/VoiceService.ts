/* eslint-disable @typescript-eslint/no-explicit-any -- legacy untyped window.electronAPI bridge */
import { type VoiceConfig, type VoiceSettings, type VoiceContribute } from '@nomi-ai/types';
import { t } from '@nomi-ai/ui';

import { HOURLY_LINES } from '../mascot/tips';
import { toFileUrl } from '../utils/fileUrl';

/**
 * 语音服务类
 * 负责管理语音播放与定时播报（按键序列彩蛋已移除）。
 */
const TIME_KEYWORDS: Array<[string, number]> = [
  ['$time_morning', 7],
  ['$time_before_noon', 10],
  ['$time_noon', 12],
  ['$time_evening', 19],
  ['$time_midnight', 23],
  ['$time_each_hour', 15],
];
const TIME_KEYWORD_LINES = TIME_KEYWORDS.map(([keyword, hour]) => ({
  keywords: [keyword],
  voices: HOURLY_LINES.find((h) => hour >= h.from && hour <= h.to)?.lines ?? [],
}));

export class VoiceService {
  /** 立即停止当前音频（语音打断） */
  stop(): void {
    try {
      this.currentAudio?.pause();
    } catch {
      /* ignore */
    }
    this.currentAudio = null;
  }

  private voiceConfig: VoiceConfig | null = null;
  private voiceSettings: VoiceSettings | null = null;
  private timeAnnouncementInterval: NodeJS.Timeout | null = null;
  private lastAnnouncementTime: number = 0;
  private audioContext: AudioContext | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  /**
   * 等待初始化完成
   */
  public async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * 检查是否已初始化
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 初始化语音服务
   */
  private async init() {
    try {
      // 0. 等待electronAPI准备就绪
      await this.waitForElectronAPI();

      // 1. 设置音频播放监听
      this.setupAudioListener();

      // 2. 加载语音配置
      await this.loadVoiceConfig();

      // 3. 加载语音设置
      await this.loadVoiceSettings();

      // 4. 启动定时播报
      this.startTimeAnnouncement();

      this.isInitialized = true;
    } catch (error) {
      console.error('VoiceService: 初始化失败:', error);
      this.isInitialized = false;
    }
  }

  /**
   * 等待electronAPI准备就绪
   */
  private async waitForElectronAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50; // 最多等待5秒

      const checkAPI = () => {
        attempts++;
        const electronAPI = (window as any).electronAPI;

        if (electronAPI) {
          resolve();
        } else if (attempts >= maxAttempts) {
          console.error('VoiceService: 等待electronAPI超时');
          reject(new Error(t('electronAPI准备超时')));
        } else {
          setTimeout(checkAPI, 100);
        }
      };

      checkAPI();
    });
  }

  /**
   * 加载语音配置：使用内置原创台词（src/mascot/tips.ts），由系统语音朗读。
   * （旧版的第三方 mp3 语音包许可不明，已移除）
   */
  private async loadVoiceConfig() {
    // 仅保留定时播报台词；按键关键词彩蛋已移除
    this.voiceConfig = {
      contributes: [...TIME_KEYWORD_LINES],
    };
  }

  /**
   * 加载语音设置
   */
  private async loadVoiceSettings() {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI) {
        this.voiceSettings = await electronAPI.getVoiceSettings();
      } else {
        console.error('VoiceService: electronAPI 不可用，无法加载语音设置');
      }
    } catch (error) {
      console.error('VoiceService: 加载语音设置失败:', error);
    }
  }

  /**
   * 设置音频播放监听
   */
  private setupAudioListener() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) return;

    // 注意：这个监听器现在不再需要，因为我们直接在playVoice中处理音频播放
    // electronAPI.onPlayAudioFile((filePath: string, volume: number) => {
    //   this.playAudioFile(filePath, volume);
    // });
  }

  /**
   * 播放随机语音
   */
  private playRandomVoice(voices: string[]) {
    if (voices.length === 0) return;

    const randomIndex = Math.floor(Math.random() * voices.length);
    const selectedVoice = voices[randomIndex];

    this.playVoice(selectedVoice);
  }

  /**
   * 朗读一句台词（Web Speech API，系统自带语音，无需音频资源）。
   */
  private async playVoice(line: string) {
    try {
      window.dispatchEvent(new CustomEvent('mascot:say', { detail: { text: line } }));
      const { speakForActiveCharacter, resolvePrefsForCharacter } =
        await import('../mascot/characterVoice');
      const prefs = resolvePrefsForCharacter();
      if (this.voiceSettings?.volume != null) prefs.volume = this.voiceSettings.volume;
      speakForActiveCharacter(line, { prefs });
    } catch (error) {
      console.error('VoiceService: 朗读失败:', error);
    }
  }

  /**
   * 从URL播放音频（开发环境）
   */
  private playAudioFromUrl(audioUrl: string, volume: number) {
    try {
      // 停止当前播放的音频
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }

      // 创建新的音频元素
      this.currentAudio = new Audio();
      this.currentAudio.src = audioUrl;
      this.currentAudio.volume = Math.max(0, Math.min(1, volume));

      // 添加事件监听器
      this.currentAudio.addEventListener('error', (e) => {
        console.error('VoiceService: 音频加载失败:', e, '路径:', audioUrl);
      });

      // 播放音频
      this.currentAudio.play().catch((error) => {
        console.error('VoiceService: 播放音频失败:', error);
      });

      // 播放完成后清理
      this.currentAudio.addEventListener('ended', () => {
        this.currentAudio = null;
      });
    } catch (error) {
      console.error('VoiceService: 播放音频失败:', error);
    }
  }

  /**
   * 从二进制数据播放音频（生产环境）
   */
  private playAudioFromData(audioData: ArrayBuffer | string | Buffer, volume: number) {
    try {
      // 停止当前播放的音频
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }

      let buffer: ArrayBuffer;

      // 处理不同类型的数据
      if (audioData instanceof ArrayBuffer) {
        buffer = audioData;
      } else if (typeof audioData === 'string') {
        // 检查是否是data URL，直接使用
        if (audioData.startsWith('data:')) {
          this.currentAudio = new Audio();
          this.currentAudio.src = audioData;
          this.currentAudio.volume = Math.max(0, Math.min(1, volume));

          this.currentAudio.addEventListener('error', (e) => {
            console.error('VoiceService: 音频播放失败:', e);
          });

          this.currentAudio.play().catch((error) => {
            console.error('VoiceService: 播放data URL音频失败:', error);
          });

          return;
        } else {
          // 尝试作为base64解码
          try {
            const binaryString = atob(audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            buffer = bytes.buffer;
          } catch (error) {
            console.error('VoiceService: base64解码失败:', error);
            // 如果解码失败，尝试直接作为二进制字符串处理
            const bytes = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
              bytes[i] = audioData.charCodeAt(i);
            }
            buffer = bytes.buffer;
          }
        }
      } else if (audioData && typeof audioData === 'object' && 'buffer' in audioData) {
        // 处理Node.js Buffer对象
        const bufferData = audioData as any;
        buffer = bufferData.buffer.slice(
          bufferData.byteOffset,
          bufferData.byteOffset + bufferData.byteLength,
        ) as ArrayBuffer;
      } else {
        console.error('VoiceService: 不支持的音频数据类型:', typeof audioData);
        return;
      }

      // 创建Blob URL
      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      // 创建新的音频元素
      this.currentAudio = new Audio();
      this.currentAudio.src = audioUrl;
      this.currentAudio.volume = Math.max(0, Math.min(1, volume));

      // 添加事件监听器
      this.currentAudio.addEventListener('error', (e) => {
        console.error('VoiceService: 音频播放失败:', e);
        URL.revokeObjectURL(audioUrl); // 清理Blob URL
      });

      // 播放音频
      this.currentAudio.play().catch((error) => {
        console.error('VoiceService: 播放音频数据失败:', error);
        URL.revokeObjectURL(audioUrl); // 清理Blob URL
      });

      // 播放完成后清理
      this.currentAudio.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl); // 清理Blob URL
        this.currentAudio = null;
      });
    } catch (error) {
      console.error('VoiceService: 播放音频数据失败:', error);
    }
  }

  /**
   * 播放音频文件（通过HTML5 Audio）
   */
  private playAudioFile(filePath: string, volume: number) {
    try {
      // 停止当前播放的音频
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }

      // 创建新的音频元素
      this.currentAudio = new Audio();

      // 处理文件路径 - 在Electron中需要特殊处理
      // 绝对路径（含 Windows 盘符 / UNC）转为 file:// URL，URL 原样使用
      const audioSrc = toFileUrl(filePath);

      this.currentAudio.src = audioSrc;
      this.currentAudio.volume = Math.max(0, Math.min(1, volume));

      // 添加错误处理
      this.currentAudio.addEventListener('error', (e) => {
        console.error('音频加载失败:', e, '路径:', audioSrc);
      });

      // 播放音频
      this.currentAudio.play().catch((error) => {
        console.error('VoiceService: 播放音频失败:', error);

        // 尝试使用不同的路径格式
        if (audioSrc.startsWith('file://')) {
          const alternativeSrc = filePath.replace(/\\/g, '/');
          this.currentAudio!.src = alternativeSrc;
          this.currentAudio!.play().catch((err) => {
            console.error('VoiceService: 备用路径也失败:', err);
          });
        }
      });

      // 播放完成后清理
      this.currentAudio.addEventListener('ended', () => {
        this.currentAudio = null;
      });
    } catch (error) {
      console.error('VoiceService: 播放音频文件失败:', error);
    }
  }

  /**
   * 启动定时播报
   */
  private startTimeAnnouncement() {
    if (!this.voiceSettings?.timeAnnouncement) return;

    // 每分钟检查一次是否需要播报
    this.timeAnnouncementInterval = setInterval(() => {
      this.checkTimeAnnouncement();
    }, 60000); // 60秒

    // 立即检查一次
    this.checkTimeAnnouncement();
  }

  /**
   * 检查时间播报
   */
  private checkTimeAnnouncement() {
    if (!this.voiceConfig || !this.voiceSettings?.enabled) return;

    const now = new Date();
    const currentTime = now.getTime();

    // 避免频繁播报（至少间隔30分钟）
    if (currentTime - this.lastAnnouncementTime < 30 * 60 * 1000) {
      return;
    }

    const hour = now.getHours();
    let timeKeyword = '';

    // 根据时间确定关键词
    if (hour >= 6 && hour < 11) {
      timeKeyword = '$time_morning';
    } else if (hour >= 11 && hour < 13) {
      timeKeyword = '$time_before_noon';
    } else if (hour >= 13 && hour < 14) {
      timeKeyword = '$time_noon';
    } else if (hour >= 17 && hour < 22) {
      timeKeyword = '$time_evening';
    } else if (hour >= 22 || hour < 6) {
      timeKeyword = '$time_midnight';
    }

    // 每小时播报
    if (now.getMinutes() === 0) {
      timeKeyword = '$time_each_hour';
    }

    if (timeKeyword) {
      const contribute = this.voiceConfig.contributes.find((c: VoiceContribute) =>
        c.keywords.includes(timeKeyword),
      );

      if (contribute) {
        this.playRandomVoice(contribute.voices);
        this.lastAnnouncementTime = currentTime;
      }
    }
  }

  /**
   * 更新语音设置
   */
  public async updateSettings(newSettings: Partial<VoiceSettings>) {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) return;

      // 合并设置
      this.voiceSettings = { ...this.voiceSettings, ...newSettings } as VoiceSettings;

      // 保存设置
      electronAPI.saveVoiceSettings(this.voiceSettings);
      window.dispatchEvent(
        new CustomEvent('mascot:voice-settings', { detail: { ...this.voiceSettings } }),
      );

      if (newSettings.timeAnnouncement !== undefined) {
        if (this.timeAnnouncementInterval) {
          clearInterval(this.timeAnnouncementInterval);
          this.timeAnnouncementInterval = null;
        }

        if (newSettings.timeAnnouncement) {
          this.startTimeAnnouncement();
        }
      }
    } catch (error) {
      console.error('更新语音设置失败:', error);
    }
  }

  /**
   * 获取当前设置
   */
  public getSettings(): VoiceSettings | null {
    return this.voiceSettings;
  }

  /**
   * 销毁服务
   */
  public destroy() {
    const electronAPI = (window as any).electronAPI;

    if (electronAPI) {
      electronAPI.removeAudioListeners?.();
    }

    if (this.timeAnnouncementInterval) {
      clearInterval(this.timeAnnouncementInterval);
    }

    // 停止当前音频
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }
}
