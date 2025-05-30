import { VoiceConfig, VoiceSettings, KeyboardEvent, VoiceContribute } from '@ig-live/types';

/**
 * 语音服务类
 * 负责管理语音播放、键盘监听和定时播报功能
 */
export class VoiceService {
  private voiceConfig: VoiceConfig | null = null;
  private voiceSettings: VoiceSettings | null = null;
  private keyBuffer: string[] = [];
  private keyBufferTimeout: NodeJS.Timeout | null = null;
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

      // 1. 首先设置键盘监听器（只设置事件监听器，不启动）
      this.setupKeyboardListener();

      // 2. 设置音频播放监听
      this.setupAudioListener();

      // 3. 加载语音配置
      await this.loadVoiceConfig();

      // 4. 加载语音设置
      await this.loadVoiceSettings();

      // 5. 在设置加载完成后启动键盘监听
      this.startKeyboardListener();

      // 6. 启动定时播报
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
          reject(new Error('electronAPI准备超时'));
        } else {
          setTimeout(checkAPI, 100);
        }
      };

      checkAPI();
    });
  }

  /**
   * 加载语音配置
   */
  private async loadVoiceConfig() {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI) {
        // 使用相对路径，与模型加载保持一致
        const configPath = './assets/voice/contributes.json';

        try {
          // 尝试通过Electron API加载
          const configData = await electronAPI.readLocalFile(configPath);
          if (configData) {
            this.voiceConfig = JSON.parse(configData);
            return;
          }
        } catch (error) {
          console.error('VoiceService: 通过Electron API加载语音配置失败:', error);
        }

        // 回退到标准fetch（开发环境）
        try {
          const response = await fetch(configPath);
          if (response.ok) {
            this.voiceConfig = await response.json();
            return;
          }
        } catch (error) {
          console.error('VoiceService: 通过fetch加载语音配置失败:', error);
        }
      } else {
        console.error('VoiceService: electronAPI 不可用，无法加载语音配置');
      }
    } catch (error) {
      console.error('VoiceService: 加载语音配置失败:', error);
    }
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
   * 设置键盘监听
   */
  private setupKeyboardListener() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) {
      console.error('VoiceService: electronAPI 不可用，无法设置键盘监听');
      return;
    }

    // 立即注册键盘事件监听器
    try {
      electronAPI.onKeyboardEvent((event: KeyboardEvent) => {
        // 简化条件检查
        if (event.type === 'keydown' && event.key && event.key !== 'undefined') {
          this.handleKeyboardInput(event.key);
        }
      });
    } catch (error) {
      console.error('VoiceService: 注册键盘事件监听器失败:', error);
    }

    // 监听键盘监听器错误事件
    electronAPI.onKeyboardListenerError((error: string) => {
      console.error('VoiceService: 键盘监听器启动失败:', error);
    });
  }

  /**
   * 启动键盘监听
   */
  private startKeyboardListener() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) {
      console.error('VoiceService: electronAPI 不可用，无法启动键盘监听');
      return;
    }

    // 添加延迟，确保主进程完全启动
    setTimeout(() => {
      electronAPI.startKeyboardListener();
    }, 1000);

    // 添加智能重试机制
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 3000; // 增加重试间隔

    const retryStart = () => {
      retryCount++;
      if (retryCount <= maxRetries) {
        setTimeout(() => {
          electronAPI.startKeyboardListener();
          if (retryCount < maxRetries) {
            setTimeout(retryStart, retryDelay);
          }
        }, retryDelay);
      } else {
        console.error('VoiceService: 键盘监听启动重试次数已达上限');
      }
    };

    // 启动重试序列
    setTimeout(retryStart, retryDelay);
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
   * 处理键盘输入
   */
  private handleKeyboardInput(key: string) {
    // 将按键添加到缓冲区
    this.keyBuffer.push(key.toLowerCase());

    // 限制缓冲区大小
    if (this.keyBuffer.length > 50) {
      this.keyBuffer.shift();
    }

    // 清除之前的超时
    if (this.keyBufferTimeout) {
      clearTimeout(this.keyBufferTimeout);
    }

    // 设置新的超时，在停止输入后分析按键序列
    this.keyBufferTimeout = setTimeout(() => {
      this.analyzeKeySequence();
      this.keyBuffer = [];
    }, 1000); // 1秒后分析
  }

  /**
   * 分析按键序列并触发相应语音
   */
  private analyzeKeySequence() {
    if (!this.voiceConfig || !this.voiceSettings?.enabled) {
      return;
    }

    const keySequence = this.keyBuffer.join('');

    // 检查是否匹配任何关键词
    for (const contribute of this.voiceConfig.contributes) {
      for (const keyword of contribute.keywords) {
        // 跳过时间相关的关键词（这些由定时播报处理）
        if (keyword.startsWith('$time_')) continue;

        if (keySequence.includes(keyword.toLowerCase())) {
          this.playRandomVoice(contribute.voices);
          return; // 找到匹配后立即返回，避免重复播放
        }
      }
    }
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
   * 播放指定语音文件
   */
  private async playVoice(voiceFile: string) {
    try {
      // 构建语音文件的相对路径，与模型加载保持一致
      const voicePath = `./assets/voice/${voiceFile}`;

      // 检查是否在Electron环境中
      const electronAPI = (window as any).electronAPI;

      if (electronAPI) {
        // 在Electron环境中，使用readLocalFile API加载音频数据
        try {
          const audioData = await electronAPI.readLocalFile(voicePath);
          if (audioData) {
            // 检查数据类型
            if (audioData instanceof ArrayBuffer) {
              this.playAudioFromData(audioData, this.voiceSettings?.volume || 0.8);
            } else if (typeof audioData === 'string') {
              // 如果是字符串，可能是base64编码的数据
              this.playAudioFromData(audioData, this.voiceSettings?.volume || 0.8);
            } else {
              console.error('VoiceService: 未知的音频数据类型:', typeof audioData);
              // 回退到URL播放
              this.playAudioFromUrl(voicePath, this.voiceSettings?.volume || 0.8);
            }
            return;
          }
        } catch (error) {
          console.error('VoiceService: 通过Electron API加载音频失败:', error);
        }
      }

      // 回退到标准的音频播放方式（开发环境）
      this.playAudioFromUrl(voicePath, this.voiceSettings?.volume || 0.8);

    } catch (error) {
      console.error('VoiceService: 播放语音失败:', error);
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
      this.currentAudio.play().catch(error => {
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

          this.currentAudio.play().catch(error => {
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
        buffer = bufferData.buffer.slice(bufferData.byteOffset, bufferData.byteOffset + bufferData.byteLength) as ArrayBuffer;
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
      this.currentAudio.play().catch(error => {
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
      let audioSrc = filePath;
      if (filePath.startsWith('/')) {
        // 绝对路径，使用file://协议
        audioSrc = `file://${filePath}`;
      } else if (!filePath.startsWith('http') && !filePath.startsWith('file://')) {
        // 相对路径，转换为绝对路径
        audioSrc = `file://${filePath}`;
      }

      this.currentAudio.src = audioSrc;
      this.currentAudio.volume = Math.max(0, Math.min(1, volume));

      // 添加错误处理
      this.currentAudio.addEventListener('error', (e) => {
        console.error('音频加载失败:', e, '路径:', audioSrc);
      });

      // 播放音频
      this.currentAudio.play().catch(error => {
        console.error('VoiceService: 播放音频失败:', error);

        // 尝试使用不同的路径格式
        if (audioSrc.startsWith('file://')) {
          const alternativeSrc = filePath.replace(/\\/g, '/');
          this.currentAudio!.src = alternativeSrc;
          this.currentAudio!.play().catch(err => {
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
        c.keywords.includes(timeKeyword)
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

      // 重新启动相关服务
      if (newSettings.keyboardListening !== undefined) {
        if (newSettings.keyboardListening) {
          electronAPI.startKeyboardListener();
        } else {
          electronAPI.stopKeyboardListener();
        }
      }

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

    // 停止键盘监听
    if (electronAPI) {
      electronAPI.stopKeyboardListener();
      electronAPI.removeKeyboardListeners();
      electronAPI.removeAudioListeners();
    }

    // 清理定时器
    if (this.keyBufferTimeout) {
      clearTimeout(this.keyBufferTimeout);
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