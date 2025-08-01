import { BaseAdapter, ToolResult, CharacterResponse } from './BaseAdapter.js';

/**
 * 动画工具
 * 提供3D虚拟角色动画控制和演示功能
 */
export class AnimationTool extends BaseAdapter {
  private errorCount: number = 0;
  private totalExecutionTime: number = 0;
  private executionCount: number = 0;
  private animationQueue: AnimationRequest[] = [];

  constructor() {
    super(
      'show_animation',
      '控制3D虚拟角色播放各种动画，支持概念演示、情感表达和交互指导',
      '1.0.0'
    );
  }

  /**
   * 执行动画
   */
  async execute(args: any): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      console.log('AnimationTool: 开始执行动画', args);

      // 验证输入参数
      const validation = this.validateInput(args);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const { animationType, concept, duration, intensity, sequence } = args;

      // 生成动画序列
      const animationSequence = await this.generateAnimationSequence({
        animationType,
        concept,
        duration: duration || 3000,
        intensity: intensity || 0.8,
        sequence
      });

      // 生成角色响应
      const characterResponse = this.createCharacterResponse(animationSequence);

      // 添加到队列
      this.animationQueue.push({
        id: Date.now().toString(),
        sequence: animationSequence,
        timestamp: Date.now()
      });

      const executionDuration = Date.now() - startTime;
      this.updateStats(executionDuration);

      console.log('AnimationTool: 动画生成完成');

      return {
        success: true,
        content: `动画序列已生成：${animationSequence.name}`,
        metadata: {
          timestamp: Date.now(),
          duration: executionDuration,
          characterResponse,
          animationId: this.animationQueue[this.animationQueue.length - 1].id,
          animationDetails: animationSequence
        }
      };
    } catch (error) {
      this.errorCount++;
      const duration = Date.now() - startTime;
      this.updateStats(duration);

      console.error('AnimationTool: 执行失败:', error);

      return {
        success: false,
        content: '动画生成失败',
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
        animationType: {
          type: 'string',
          description: '动画类型',
          enum: [
            'explaining',      // 解释动作
            'greeting',        // 问候动作
            'pointing',        // 指向动作
            'thinking',        // 思考动作
            'celebrating',     // 庆祝动作
            'confused',        // 困惑动作
            'demonstrating',   // 演示动作
            'idle',           // 待机动作
            'custom'          // 自定义动作
          ]
        },
        concept: {
          type: 'string',
          description: '要演示的概念或主题（可选）'
        },
        duration: {
          type: 'number',
          description: '动画持续时间（毫秒），默认3000',
          minimum: 500,
          maximum: 30000
        },
        intensity: {
          type: 'number',
          description: '动画强度（0-1），默认0.8',
          minimum: 0,
          maximum: 1
        },
        sequence: {
          type: 'array',
          description: '自定义动画序列',
          items: {
            type: 'object',
            properties: {
              animation: { type: 'string' },
              duration: { type: 'number' },
              expression: { type: 'string' }
            }
          }
        },
        emotion: {
          type: 'string',
          description: '情感状态',
          enum: ['neutral', 'happy', 'excited', 'focused', 'confused', 'proud']
        }
      },
      required: ['animationType']
    };
  }

  /**
   * 生成动画序列
   */
  private async generateAnimationSequence(request: AnimationGenerationRequest): Promise<AnimationSequence> {
    try {
      const { animationType, concept, duration, intensity } = request;

      // 预定义动画映射
      const animationMappings: Record<string, AnimationFrame[]> = {
        explaining: [
          { name: 'gesture_open', duration: 800, intensity: 0.8, expression: 'friendly' },
          { name: 'point_forward', duration: 1000, intensity: intensity, expression: 'focused' },
          { name: 'gesture_conclude', duration: 600, intensity: 0.6, expression: 'satisfied' }
        ],
        greeting: [
          { name: 'wave_hello', duration: 1200, intensity: 0.9, expression: 'happy' },
          { name: 'bow_slight', duration: 800, intensity: 0.7, expression: 'polite' }
        ],
        pointing: [
          { name: 'point_right', duration: 1500, intensity: intensity, expression: 'focused' },
          { name: 'hold_point', duration: duration - 2000, intensity: intensity * 0.8, expression: 'focused' },
          { name: 'point_return', duration: 500, intensity: 0.5, expression: 'neutral' }
        ],
        thinking: [
          { name: 'hand_to_chin', duration: 1000, intensity: 0.6, expression: 'thoughtful' },
          { name: 'look_up', duration: 1500, intensity: 0.4, expression: 'thinking' },
          { name: 'nod_understanding', duration: 800, intensity: 0.7, expression: 'enlightened' }
        ],
        celebrating: [
          { name: 'raise_arms', duration: 1000, intensity: 0.9, expression: 'excited' },
          { name: 'jump_small', duration: 800, intensity: intensity, expression: 'joyful' },
          { name: 'clap_hands', duration: 1200, intensity: 0.8, expression: 'proud' }
        ],
        confused: [
          { name: 'scratch_head', duration: 1500, intensity: 0.7, expression: 'confused' },
          { name: 'shrug_shoulders', duration: 1000, intensity: 0.6, expression: 'uncertain' },
          { name: 'tilt_head', duration: 800, intensity: 0.5, expression: 'puzzled' }
        ],
        demonstrating: [
          { name: 'gesture_start', duration: 600, intensity: 0.7, expression: 'ready' },
          { name: 'show_object', duration: duration - 1400, intensity: intensity, expression: 'demonstrative' },
          { name: 'gesture_finish', duration: 800, intensity: 0.6, expression: 'complete' }
        ],
        idle: [
          { name: 'breathing', duration: 2000, intensity: 0.3, expression: 'neutral' },
          { name: 'blink_natural', duration: 200, intensity: 0.4, expression: 'neutral' },
          { name: 'small_movement', duration: duration - 2200, intensity: 0.2, expression: 'calm' }
        ]
      };

      // 根据概念增强动画
      const frames = this.enhanceAnimationForConcept(
        animationMappings[animationType] || animationMappings.idle,
        concept
      );

      // 生成动画序列
      const sequence: AnimationSequence = {
        id: Date.now().toString(),
        name: `${animationType}_${concept || 'default'}`,
        totalDuration: duration,
        frames: frames.map(frame => ({
          ...frame,
          duration: Math.round(frame.duration * (duration / frames.reduce((sum, f) => sum + f.duration, 0)))
        })),
        metadata: {
          animationType,
          concept,
          intensity,
          createdAt: Date.now()
        }
      };

      return sequence;
    } catch (error) {
      console.error('动画序列生成失败:', error);
      throw new Error(`动画序列生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 根据概念增强动画
   */
  private enhanceAnimationForConcept(baseFrames: AnimationFrame[], concept?: string): AnimationFrame[] {
    if (!concept) return baseFrames;

    const conceptMappings: Record<string, Partial<AnimationFrame>> = {
      // 编程概念
      'variable': { expression: 'explaining', intensity: 0.6 },
      'function': { name: 'gesture_flow', expression: 'methodical' },
      'loop': { name: 'circular_gesture', expression: 'rhythmic' },
      'condition': { name: 'branch_gesture', expression: 'decisive' },
      'array': { name: 'list_gesture', expression: 'organized' },
      'object': { name: 'container_gesture', expression: 'structural' },

      // 数学概念
      'addition': { name: 'combine_gesture', expression: 'positive' },
      'multiplication': { name: 'expand_gesture', expression: 'growth' },
      'equation': { name: 'balance_gesture', expression: 'balanced' },

      // 一般概念
      'introduction': { expression: 'welcoming', intensity: 0.8 },
      'conclusion': { expression: 'satisfied', intensity: 0.7 },
      'important': { expression: 'emphasized', intensity: 0.9 },
      'warning': { expression: 'careful', intensity: 0.8 }
    };

    const enhancement = conceptMappings[concept.toLowerCase()];
    if (!enhancement) return baseFrames;

    return baseFrames.map(frame => ({
      ...frame,
      ...enhancement,
      intensity: enhancement.intensity || frame.intensity
    }));
  }

  /**
   * 创建角色响应
   */
  private createCharacterResponse(sequence: AnimationSequence): CharacterResponse {
    const primaryFrame = sequence.frames[0];

    return {
      animation: primaryFrame.name,
      expression: primaryFrame.expression,
      speech: this.generateSpeechForAnimation(sequence),
      gesture: sequence.metadata.animationType === 'pointing' ? 'point' : 'normal',
      lookAt: sequence.metadata.animationType === 'demonstrating' ? {
        x: 0, y: 0, z: 3
      } : undefined
    };
  }

  /**
   * 为动画生成语音文本
   */
  private generateSpeechForAnimation(sequence: AnimationSequence): string {
    const { animationType, concept } = sequence.metadata;

    const speechTemplates: Record<string, string[]> = {
      explaining: [
        concept ? `让我来为您演示${concept}` : '让我来解释这个概念',
        concept ? `现在我将展示${concept}是如何工作的` : '请注意这里的要点',
        concept ? `通过这个演示，您可以更好地理解${concept}` : '这就是关键所在'
      ],
      greeting: [
        '您好！很高兴见到您',
        '欢迎来到我们的学习环境',
        '让我们开始今天的学习之旅吧'
      ],
      pointing: [
        concept ? `请看这里的${concept}` : '请注意这个地方',
        concept ? `${concept}就在这个位置` : '重点在这里',
        concept ? `我来指出${concept}的位置` : '这里很重要'
      ],
      thinking: [
        concept ? `让我想想${concept}的最佳解释方式` : '让我思考一下',
        '嗯...这是一个有趣的问题',
        '我需要仔细考虑这个问题'
      ],
      celebrating: [
        '太棒了！您做得很好',
        '恭喜您！这是正确的',
        '完美！您已经掌握了这个概念'
      ],
      confused: [
        '嗯...这个问题有点复杂',
        '让我再想想这个问题',
        '这确实需要更仔细的分析'
      ],
      demonstrating: [
        concept ? `现在我来演示${concept}` : '让我来展示这个过程',
        concept ? `通过这个演示，您可以看到${concept}的工作原理` : '请仔细观察这个演示',
        '这就是它的工作方式'
      ],
      idle: [
        '我在这里等待您的指令',
        '请告诉我您想了解什么',
        '有什么我可以帮助您的吗？'
      ]
    };

    const templates = speechTemplates[animationType] || speechTemplates.idle;
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * 更新统计信息
   */
  private updateStats(duration: number): void {
    this.executionCount++;
    this.totalExecutionTime += duration;
  }

  /**
   * 获取工具统计信息
   */
  getStatistics() {
    return {
      totalCalls: this.executionCount,
      successfulCalls: this.executionCount - this.errorCount,
      errorCount: this.errorCount,
      averageExecutionTime: this.executionCount > 0 ? this.totalExecutionTime / this.executionCount : 0,
      animationQueueLength: this.animationQueue.length
    };
  }

  /**
   * 清空动画队列
   */
  clearAnimationQueue(): void {
    this.animationQueue = [];
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
      queuedAnimations: this.animationQueue.length
    };
  }
}

/**
 * 动画生成请求接口
 */
interface AnimationGenerationRequest {
  animationType: string;
  concept?: string;
  duration: number;
  intensity: number;
  sequence?: any[];
}

/**
 * 动画序列接口
 */
interface AnimationSequence {
  id: string;
  name: string;
  totalDuration: number;
  frames: AnimationFrame[];
  metadata: {
    animationType: string;
    concept?: string;
    intensity: number;
    createdAt: number;
  };
}

/**
 * 动画帧接口
 */
interface AnimationFrame {
  name: string;
  duration: number;
  intensity: number;
  expression: string;
}

/**
 * 动画请求接口
 */
interface AnimationRequest {
  id: string;
  sequence: AnimationSequence;
  timestamp: number;
}


