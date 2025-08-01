import { BaseAdapter, ToolResult, CharacterResponse } from './BaseAdapter.js';

/**
 * 手势引导工具
 * 提供3D角色手势引导和视觉指向功能
 */
export class GestureGuideTool extends BaseAdapter {
  private errorCount: number = 0;
  private totalExecutionTime: number = 0;
  private executionCount: number = 0;
  private activeGestures: Map<string, GestureSession> = new Map();

  constructor() {
    super(
      'gesture_guide',
      '提供3D角色手势引导和视觉指向功能，增强用户交互体验',
      '1.0.0'
    );
  }

  /**
   * 执行手势引导
   */
  async execute(args: any): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      console.log('GestureGuideTool: 开始执行手势引导', args);

      // 验证输入参数
      const validation = this.validateInput(args);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const {
        gesture,
        target,
        duration = 2000,
        intensity = 0.8,
        context,
        highlightArea,
        followUp
      } = args;

      // 生成手势指令
      const gestureInstruction = await this.generateGestureInstruction({
        gesture,
        target,
        duration,
        intensity,
        context,
        highlightArea,
        followUp
      });

      // 生成角色响应
      const characterResponse = this.createCharacterResponse(gestureInstruction);

      // 保存手势会话
      const sessionId = Date.now().toString();
      this.activeGestures.set(sessionId, {
        id: sessionId,
        instruction: gestureInstruction,
        startTime: Date.now(),
        status: 'active'
      });

      const executionDuration = Date.now() - startTime;
      this.updateStats(executionDuration);

      console.log('GestureGuideTool: 手势引导生成完成');

      return {
        success: true,
        content: `手势引导已激活：${gestureInstruction.description}`,
        metadata: {
          timestamp: Date.now(),
          duration: executionDuration,
          characterResponse,
          gestureSession: sessionId,
          gestureType: gesture,
          targetArea: target
        }
      };
    } catch (error) {
      this.errorCount++;
      const duration = Date.now() - startTime;
      this.updateStats(duration);

      console.error('GestureGuideTool: 执行失败:', error);

      return {
        success: false,
        content: '手势引导生成失败',
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
        gesture: {
          type: 'string',
          description: '手势类型',
          enum: [
            'point',           // 指向
            'highlight',       // 高亮指示
            'circle',          // 圆形指示
            'underline',       // 下划线指示
            'frame',           // 框选指示
            'wave',            // 挥手
            'thumbs_up',       // 点赞
            'open_palm',       // 张开手掌
            'finger_gun',      // 手指枪
            'peace',           // 比V
            'ok_sign',         // OK手势
            'attention',       // 注意手势
            'stop',            // 停止手势
            'come_here',       // 招手过来
            'follow_me'        // 跟我来
          ]
        },
        target: {
          type: 'string',
          description: '指向目标或区域',
          enum: [
            'screen',          // 屏幕
            'code_area',       // 代码区域
            'terminal',        // 终端
            'sidebar',         // 侧边栏
            'top_menu',        // 顶部菜单
            'bottom_panel',    // 底部面板
            'left_panel',      // 左面板
            'right_panel',     // 右面板
            'center',          // 中心
            'specific_line',   // 特定行
            'error_location',  // 错误位置
            'button',          // 按钮
            'input_field',     // 输入框
            'custom'           // 自定义位置
          ]
        },
        duration: {
          type: 'number',
          description: '手势持续时间（毫秒），默认2000',
          minimum: 500,
          maximum: 10000
        },
        intensity: {
          type: 'number',
          description: '手势强度（0-1），默认0.8',
          minimum: 0,
          maximum: 1
        },
        context: {
          type: 'string',
          description: '上下文信息，用于优化手势选择'
        },
        highlightArea: {
          type: 'object',
          description: '需要高亮的区域坐标',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' }
          }
        },
        followUp: {
          type: 'string',
          description: '后续动作或说明'
        }
      },
      required: ['gesture', 'target']
    };
  }

  /**
   * 生成手势指令
   */
  private async generateGestureInstruction(request: GestureInstructionRequest): Promise<GestureInstruction> {
    try {
      const { gesture, target, duration, intensity, context, highlightArea, followUp } = request;

      // 手势配置映射
      const gestureConfigs: Record<string, GestureConfig> = {
        point: {
          armPosition: { x: 0.3, y: 0.8, z: 0.2 },
          handShape: 'index_point',
          movement: 'steady_point',
          strength: intensity
        },
        highlight: {
          armPosition: { x: 0, y: 0.9, z: 0.3 },
          handShape: 'open_palm',
          movement: 'circular_highlight',
          strength: intensity * 0.9
        },
        circle: {
          armPosition: { x: 0.2, y: 0.8, z: 0.3 },
          handShape: 'index_point',
          movement: 'circular_motion',
          strength: intensity
        },
        underline: {
          armPosition: { x: 0.1, y: 0.7, z: 0.2 },
          handShape: 'index_point',
          movement: 'horizontal_line',
          strength: intensity * 0.8
        },
        frame: {
          armPosition: { x: 0, y: 0.8, z: 0.4 },
          handShape: 'frame_gesture',
          movement: 'rectangular_frame',
          strength: intensity
        },
        wave: {
          armPosition: { x: 0.4, y: 1.0, z: 0.1 },
          handShape: 'open_palm',
          movement: 'wave_motion',
          strength: intensity * 1.1
        },
        thumbs_up: {
          armPosition: { x: 0.2, y: 0.9, z: 0.2 },
          handShape: 'thumbs_up',
          movement: 'hold_gesture',
          strength: intensity
        },
        attention: {
          armPosition: { x: 0.1, y: 1.2, z: 0.1 },
          handShape: 'index_up',
          movement: 'attention_wave',
          strength: intensity * 1.2
        }
      };

      // 目标位置映射
      const targetPositions: Record<string, TargetPosition> = {
        screen: { x: 0, y: 0, z: 2 },
        code_area: { x: -0.3, y: 0.2, z: 1.5 },
        terminal: { x: 0, y: -0.5, z: 1.5 },
        sidebar: { x: -0.8, y: 0, z: 1.2 },
        top_menu: { x: 0, y: 0.8, z: 1.2 },
        bottom_panel: { x: 0, y: -0.8, z: 1.2 },
        center: { x: 0, y: 0, z: 1.5 },
        button: { x: 0.2, y: -0.2, z: 1.2 },
        input_field: { x: 0, y: -0.3, z: 1.2 }
      };

      const gestureConfig = gestureConfigs[gesture] || gestureConfigs.point;
      const targetPosition = targetPositions[target] || targetPositions.center;

      // 生成描述文本
      const description = this.generateGestureDescription(gesture, target, context);

      // 生成语音指令
      const speechText = this.generateSpeechForGesture(gesture, target, context, followUp);

      return {
        id: Date.now().toString(),
        gesture,
        target,
        duration,
        intensity,
        config: gestureConfig,
        targetPosition,
        description,
        speechText,
        highlightArea,
        followUp,
        createdAt: Date.now()
      };
    } catch (error) {
      console.error('手势指令生成失败:', error);
      throw new Error(`手势指令生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成手势描述
   */
  private generateGestureDescription(gesture: string, target: string, context?: string): string {
    const gestureDescriptions: Record<string, string> = {
      point: '指向',
      highlight: '高亮显示',
      circle: '圆形标记',
      underline: '下划线标记',
      frame: '框选标记',
      wave: '挥手示意',
      thumbs_up: '点赞确认',
      attention: '注意提醒'
    };

    const targetDescriptions: Record<string, string> = {
      screen: '屏幕',
      code_area: '代码区域',
      terminal: '终端窗口',
      sidebar: '侧边栏',
      center: '中心位置',
      button: '按钮',
      input_field: '输入框'
    };

    const gestureDesc = gestureDescriptions[gesture] || gesture;
    const targetDesc = targetDescriptions[target] || target;

    let description = `${gestureDesc}${targetDesc}`;

    if (context) {
      if (context.includes('error')) {
        description += '，指出错误位置';
      } else if (context.includes('important')) {
        description += '，强调重要内容';
      } else if (context.includes('next_step')) {
        description += '，指示下一步操作';
      }
    }

    return description;
  }

  /**
   * 为手势生成语音文本
   */
  private generateSpeechForGesture(gesture: string, target: string, context?: string, followUp?: string): string {
    const speechTemplates: Record<string, string[]> = {
      point: [
        '请看这里',
        '注意这个位置',
        '重点在这里'
      ],
      highlight: [
        '我来为您高亮显示',
        '请注意这个区域',
        '这部分很重要'
      ],
      circle: [
        '让我圈出这个部分',
        '这里需要特别注意',
        '重点关注这个区域'
      ],
      wave: [
        '您好！',
        '欢迎！',
        '很高兴见到您'
      ],
      thumbs_up: [
        '做得很好！',
        '非常棒！',
        '完美！'
      ],
      attention: [
        '请注意！',
        '重要提示！',
        '特别注意这里！'
      ]
    };

    const templates = speechTemplates[gesture] || speechTemplates.point;
    let speechText = templates[Math.floor(Math.random() * templates.length)];

    // 根据目标添加具体说明
    if (target === 'error_location') {
      speechText += '这里有一个错误需要修复';
    } else if (target === 'code_area') {
      speechText += '代码中的这个部分';
    } else if (target === 'button') {
      speechText += '请点击这个按钮';
    }

    // 添加后续说明
    if (followUp) {
      speechText += `。${followUp}`;
    }

    return speechText;
  }

  /**
   * 创建角色响应
   */
  private createCharacterResponse(instruction: GestureInstruction): CharacterResponse {
    const { config, targetPosition } = instruction;

    return {
      animation: this.getAnimationForGesture(instruction.gesture),
      expression: this.getExpressionForGesture(instruction.gesture),
      speech: instruction.speechText,
      gesture: instruction.gesture,
      lookAt: targetPosition
    };
  }

  /**
   * 获取手势对应的动画
   */
  private getAnimationForGesture(gesture: string): string {
    const animationMap: Record<string, string> = {
      point: 'pointing_gesture',
      highlight: 'highlighting_motion',
      circle: 'circular_gesture',
      wave: 'friendly_wave',
      thumbs_up: 'approval_gesture',
      attention: 'attention_calling',
      frame: 'framing_gesture'
    };

    return animationMap[gesture] || 'pointing_gesture';
  }

  /**
   * 获取手势对应的表情
   */
  private getExpressionForGesture(gesture: string): string {
    const expressionMap: Record<string, string> = {
      point: 'focused',
      highlight: 'explanatory',
      circle: 'demonstrative',
      wave: 'friendly',
      thumbs_up: 'proud',
      attention: 'serious',
      frame: 'concentrated'
    };

    return expressionMap[gesture] || 'neutral';
  }

  /**
   * 更新统计信息
   */
  private updateStats(duration: number): void {
    this.executionCount++;
    this.totalExecutionTime += duration;
  }

  /**
   * 获取活跃手势会话
   */
  getActiveGestures(): GestureSession[] {
    return Array.from(this.activeGestures.values());
  }

  /**
   * 结束手势会话
   */
  endGestureSession(sessionId: string): void {
    const session = this.activeGestures.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.endTime = Date.now();
    }
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.activeGestures.entries()) {
      if (session.status === 'active' && now - session.startTime > 10000) { // 10秒超时
        this.endGestureSession(sessionId);
      }
    }
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
      activeGestures: this.activeGestures.size
    };
  }
}

/**
 * 手势指令请求接口
 */
interface GestureInstructionRequest {
  gesture: string;
  target: string;
  duration: number;
  intensity: number;
  context?: string;
  highlightArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  followUp?: string;
}

/**
 * 手势指令接口
 */
interface GestureInstruction {
  id: string;
  gesture: string;
  target: string;
  duration: number;
  intensity: number;
  config: GestureConfig;
  targetPosition: TargetPosition;
  description: string;
  speechText: string;
  highlightArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  followUp?: string;
  createdAt: number;
}

/**
 * 手势配置接口
 */
interface GestureConfig {
  armPosition: {
    x: number;
    y: number;
    z: number;
  };
  handShape: string;
  movement: string;
  strength: number;
}

/**
 * 目标位置接口
 */
interface TargetPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * 手势会话接口
 */
interface GestureSession {
  id: string;
  instruction: GestureInstruction;
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'cancelled';
}