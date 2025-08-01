import { BaseAdapter, ToolResult, CharacterResponse } from './BaseAdapter.js';

/**
 * 语音反馈工具
 * 提供智能语音合成和角色语音反馈功能
 */
export class VoiceFeedbackTool extends BaseAdapter {
  private errorCount: number = 0;
  private totalExecutionTime: number = 0;
  private executionCount: number = 0;
  private voiceCache: Map<string, VoiceSample> = new Map();

  constructor() {
    super(
      'voice_feedback',
      '生成角色语音反馈，支持多种情感和语调，提供自然的语音交互体验',
      '1.0.0'
    );
  }

  /**
   * 执行语音反馈
   */
  async execute(args: any): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      console.log('VoiceFeedbackTool: 开始执行语音反馈', args);

      // 验证输入参数
      const validation = this.validateInput(args);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const {
        message,
        emotion = 'neutral',
        voice = 'default',
        speed = 1.0,
        pitch = 1.0,
        volume = 0.8,
        duration,
        context
      } = args;

      // 生成语音反馈
      const voiceFeedback = await this.generateVoiceFeedback({
        message,
        emotion,
        voice,
        speed,
        pitch,
        volume,
        duration,
        context
      });

      // 生成角色响应
      const characterResponse = this.createCharacterResponse(voiceFeedback);

      const executionDuration = Date.now() - startTime;
      this.updateStats(executionDuration);

      console.log('VoiceFeedbackTool: 语音反馈生成完成');

      return {
        success: true,
        content: `语音反馈已生成：${voiceFeedback.processedMessage}`,
        metadata: {
          timestamp: Date.now(),
          duration: executionDuration,
          characterResponse,
          voiceSettings: voiceFeedback.settings,
          emotion: emotion,
          estimatedDuration: voiceFeedback.estimatedDuration
        }
      };
    } catch (error) {
      this.errorCount++;
      const duration = Date.now() - startTime;
      this.updateStats(duration);

      console.error('VoiceFeedbackTool: 执行失败:', error);

      return {
        success: false,
        content: '语音反馈生成失败',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          timestamp: Date.now(),
          duration
        }
      };
    }
  }

  /**
   * 获取输入参数模式
   */
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '要转换为语音的文本消息'
        },
        emotion: {
          type: 'string',
          description: '语音情感',
          enum: [
            'neutral',     // 中性
            'happy',       // 快乐
            'sad',         // 悲伤
            'excited',     // 兴奋
            'calm',        // 平静
            'confident',   // 自信
            'surprised',   // 惊讶
            'confused',    // 困惑
            'encouraging', // 鼓励
            'warning'      // 警告
          ],
          default: 'neutral'
        },
        voice: {
          type: 'string',
          description: '语音类型',
          enum: ['default', 'friendly', 'professional', 'cute', 'energetic'],
          default: 'default'
        },
        speed: {
          type: 'number',
          description: '语音速度（0.5-2.0）',
          minimum: 0.5,
          maximum: 2.0,
          default: 1.0
        },
        pitch: {
          type: 'number',
          description: '语音音调（0.5-2.0）',
          minimum: 0.5,
          maximum: 2.0,
          default: 1.0
        },
        volume: {
          type: 'number',
          description: '语音音量（0.0-1.0）',
          minimum: 0.0,
          maximum: 1.0,
          default: 0.8
        },
        duration: {
          type: 'number',
          description: '预期播放时长（毫秒，可选）',
          minimum: 100
        },
        context: {
          type: 'string',
          description: '语音上下文（用于优化语调和停顿）'
        }
      },
      required: ['message']
    };
  }

  /**
   * 生成语音反馈
   */
  private async generateVoiceFeedback(request: VoiceFeedbackRequest): Promise<VoiceFeedbackResponse> {
    try {
      const { message, emotion, voice, speed, pitch, volume, context } = request;

      // 预处理消息文本
      const processedMessage = this.preprocessMessage(message, context);

      // 生成语音设置
      const settings = this.generateVoiceSettings(emotion, voice, speed, pitch, volume);

      // 估算播放时长
      const estimatedDuration = this.estimatePlaybackDuration(processedMessage, settings);

      // 生成Viseme序列（用于唇形同步）
      const visemeSequence = this.generateVisemeSequence(processedMessage);

      // 添加到缓存
      const cacheKey = this.generateCacheKey(message, settings);
      const voiceSample: VoiceSample = {
        id: cacheKey,
        message: processedMessage,
        settings,
        visemeSequence,
        duration: estimatedDuration,
        createdAt: Date.now()
      };
      this.voiceCache.set(cacheKey, voiceSample);

      return {
        processedMessage,
        settings,
        estimatedDuration,
        visemeSequence,
        cacheKey
      };
    } catch (error) {
      console.error('语音反馈生成失败:', error);
      throw new Error(`语音反馈生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 预处理消息文本
   */
  private preprocessMessage(message: string, context?: string): string {
    let processed = message;

    // 移除多余的空格
    processed = processed.replace(/\s+/g, ' ').trim();

    // 处理标点符号，添加适当的停顿
    processed = processed.replace(/[.!?]/g, '$&,');
    processed = processed.replace(/[,;:]/g, '$&;');

    // 根据上下文调整
    if (context) {
      if (context.includes('code') || context.includes('programming')) {
        // 代码相关的语音，需要更慢的速度
        processed = `关于编程：${processed}`;
      } else if (context.includes('explanation')) {
        processed = `让我解释一下：${processed}`;
      } else if (context.includes('error') || context.includes('problem')) {
        processed = `需要注意：${processed}`;
      }
    }

    return processed;
  }

  /**
   * 生成语音设置
   */
  private generateVoiceSettings(
    emotion: string,
    voice: string,
    speed: number,
    pitch: number,
    volume: number
  ): VoiceSettings {
    // 情感调整基础设置
    const emotionAdjustments: Record<string, Partial<VoiceSettings>> = {
      happy: { pitch: 1.1, speed: 1.1, volume: 0.9 },
      sad: { pitch: 0.9, speed: 0.8, volume: 0.7 },
      excited: { pitch: 1.2, speed: 1.3, volume: 1.0 },
      calm: { pitch: 0.95, speed: 0.9, volume: 0.8 },
      confident: { pitch: 1.0, speed: 1.0, volume: 0.9 },
      surprised: { pitch: 1.15, speed: 1.2, volume: 0.85 },
      confused: { pitch: 1.05, speed: 0.85, volume: 0.75 },
      encouraging: { pitch: 1.05, speed: 0.95, volume: 0.85 },
      warning: { pitch: 0.95, speed: 0.9, volume: 0.9 }
    };

    // 语音类型调整
    const voiceAdjustments: Record<string, Partial<VoiceSettings>> = {
      friendly: { pitch: 1.05, warmth: 0.8 },
      professional: { pitch: 0.98, clarity: 0.9 },
      cute: { pitch: 1.15, warmth: 0.9 },
      energetic: { speed: 1.1, volume: 0.9 }
    };

    const baseSettings: VoiceSettings = {
      pitch,
      speed,
      volume,
      emotion,
      voice,
      clarity: 0.8,
      warmth: 0.7,
      breathiness: 0.3
    };

    // 应用情感调整
    const emotionAdj = emotionAdjustments[emotion] || {};
    const voiceAdj = voiceAdjustments[voice] || {};

    return {
      ...baseSettings,
      ...emotionAdj,
      ...voiceAdj,
      // 确保值在有效范围内
      pitch: Math.max(0.5, Math.min(2.0, (emotionAdj.pitch || pitch))),
      speed: Math.max(0.5, Math.min(2.0, (emotionAdj.speed || speed))),
      volume: Math.max(0.0, Math.min(1.0, (emotionAdj.volume || volume)))
    };
  }

  /**
   * 估算播放时长
   */
  private estimatePlaybackDuration(message: string, settings: VoiceSettings): number {
    // 基础计算：平均每分钟150个词
    const words = message.split(/\s+/).length;
    const baseWPM = 150;
    const adjustedWPM = baseWPM * settings.speed;
    const baseDuration = (words / adjustedWPM) * 60 * 1000; // 转换为毫秒

    // 添加标点停顿时间
    const punctuationPauses = (message.match(/[.!?]/g) || []).length * 500; // 每个句号500ms
    const commaPauses = (message.match(/[,;:]/g) || []).length * 200; // 每个逗号200ms

    return Math.round(baseDuration + punctuationPauses + commaPauses);
  }

  /**
   * 生成Viseme序列（用于唇形同步）
   */
  private generateVisemeSequence(message: string): VisemeFrame[] {
    const sequence: VisemeFrame[] = [];
    const words = message.split(/\s+/);
    let currentTime = 0;

    // 简化的Viseme映射
    const visemeMap: Record<string, string> = {
      'a': 'AA', 'e': 'EE', 'i': 'IH', 'o': 'OH', 'u': 'UU',
      'b': 'PP', 'p': 'PP', 'm': 'PP',
      'f': 'FF', 'v': 'FF',
      'th': 'TH', 't': 'DD', 'd': 'DD', 'n': 'DD',
      'k': 'KK', 'g': 'KK',
      'r': 'RR', 'l': 'RR',
      's': 'SS', 'z': 'SS', 'sh': 'SS'
    };

    words.forEach((word, wordIndex) => {
      const wordDuration = 300; // 平均每个词300ms
      const phonemes = this.extractPhonemes(word);

      phonemes.forEach((phoneme, phonemeIndex) => {
        const viseme = visemeMap[phoneme.toLowerCase()] || 'SIL';
        const duration = wordDuration / phonemes.length;

        sequence.push({
          viseme,
          startTime: currentTime,
          duration,
          intensity: 0.8
        });

        currentTime += duration;
      });

      // 添加词间停顿
      if (wordIndex < words.length - 1) {
        sequence.push({
          viseme: 'SIL',
          startTime: currentTime,
          duration: 100,
          intensity: 0.0
        });
        currentTime += 100;
      }
    });

    return sequence;
  }

  /**
   * 提取音素（简化版本）
   */
  private extractPhonemes(word: string): string[] {
    // 这是一个简化的音素提取
    // 在实际应用中，应该使用更复杂的语音学分析
    return word.toLowerCase().split('').filter(char => /[a-z]/.test(char));
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(message: string, settings: VoiceSettings): string {
    const hash = message + JSON.stringify(settings);
    return Buffer.from(hash).toString('base64').slice(0, 16);
  }

  /**
   * 创建角色响应
   */
  private createCharacterResponse(voiceFeedback: VoiceFeedbackResponse): CharacterResponse {
    const { settings } = voiceFeedback;

    // 根据情感选择表情和动画
    const emotionMappings: Record<string, { expression: string; animation: string; gesture: string }> = {
      neutral: { expression: 'neutral', animation: 'speaking', gesture: 'normal' },
      happy: { expression: 'happy', animation: 'speaking_happy', gesture: 'open' },
      sad: { expression: 'sad', animation: 'speaking_gentle', gesture: 'gentle' },
      excited: { expression: 'excited', animation: 'speaking_energetic', gesture: 'animated' },
      calm: { expression: 'peaceful', animation: 'speaking_calm', gesture: 'slow' },
      confident: { expression: 'confident', animation: 'speaking_confident', gesture: 'strong' },
      surprised: { expression: 'surprised', animation: 'speaking_surprised', gesture: 'quick' },
      confused: { expression: 'confused', animation: 'speaking_hesitant', gesture: 'uncertain' },
      encouraging: { expression: 'encouraging', animation: 'speaking_supportive', gesture: 'supportive' },
      warning: { expression: 'serious', animation: 'speaking_serious', gesture: 'emphasis' }
    };

    const mapping = emotionMappings[settings.emotion] || emotionMappings.neutral;

    return {
      animation: mapping.animation,
      expression: mapping.expression,
      speech: voiceFeedback.processedMessage,
      gesture: mapping.gesture
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(duration: number): void {
    this.executionCount++;
    this.totalExecutionTime += duration;
  }

  /**
   * 获取工具状态
   */
  getStatus() {
    return {
      isReady: true,
      lastUsed: Date.now(),
      errorCount: this.errorCount,
      averageExecutionTime: this.executionCount > 0 ? this.totalExecutionTime / this.executionCount : 0,
      cacheSize: this.voiceCache.size
    };
  }

  /**
   * 清空语音缓存
   */
  clearCache(): void {
    this.voiceCache.clear();
  }

  /**
   * 获取缓存的语音样本
   */
  getCachedVoice(cacheKey: string): VoiceSample | undefined {
    return this.voiceCache.get(cacheKey);
  }
}

/**
 * 语音反馈请求接口
 */
interface VoiceFeedbackRequest {
  message: string;
  emotion: string;
  voice: string;
  speed: number;
  pitch: number;
  volume: number;
  duration?: number;
  context?: string;
}

/**
 * 语音反馈响应接口
 */
interface VoiceFeedbackResponse {
  processedMessage: string;
  settings: VoiceSettings;
  estimatedDuration: number;
  visemeSequence: VisemeFrame[];
  cacheKey: string;
}

/**
 * 语音设置接口
 */
interface VoiceSettings {
  pitch: number;
  speed: number;
  volume: number;
  emotion: string;
  voice: string;
  clarity: number;
  warmth: number;
  breathiness: number;
}

/**
 * Viseme帧接口
 */
interface VisemeFrame {
  viseme: string;
  startTime: number;
  duration: number;
  intensity: number;
}

/**
 * 语音样本接口
 */
interface VoiceSample {
  id: string;
  message: string;
  settings: VoiceSettings;
  visemeSequence: VisemeFrame[];
  duration: number;
  createdAt: number;
}