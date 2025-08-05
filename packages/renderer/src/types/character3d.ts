import { VRM } from '@pixiv/three-vrm';

/**
 * 3D角色相关类型定义
 */

// ==================== 基础类型 ====================

/**
 * 渲染质量等级
 */
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra';

/**
 * 动画类型
 */
export type AnimationType =
  | 'idle'           // 待机
  | 'walking'        // 行走
  | 'running'        // 跑步
  | 'waving'         // 挥手
  | 'nodding'        // 点头
  | 'talking'        // 说话
  | 'thinking'       // 思考
  | 'surprised'      // 惊讶
  | 'happy'          // 开心
  | 'sad'            // 伤心
  | 'angry'          // 生气
  | 'custom';        // 自定义

/**
 * 表情类型
 */
export type ExpressionType =
  | 'neutral'        // 中性
  | 'happy'          // 开心
  | 'sad'            // 伤心
  | 'angry'          // 生气
  | 'surprised'      // 惊讶
  | 'disgusted'      // 厌恶
  | 'fearful'        // 恐惧
  | 'contempt'       // 轻蔑
  | 'custom';        // 自定义

/**
 * Viseme类型（用于唇形同步）
 */
export type VisemeType =
  | 'SIL' | 'A' | 'E' | 'I' | 'O' | 'U'
  | 'B' | 'C' | 'D' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M' | 'N' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'V' | 'W' | 'X' | 'Y' | 'Z';

// ==================== 状态接口 ====================

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  fps: number;
  memoryMB: number;
  timestamp?: number;
}

/**
 * 3D角色状态
 */
export interface Character3DState {
  // 渲染状态
  isLoaded: boolean;
  renderQuality: RenderQuality;
  frameRate: number;
  memoryUsage: number;

  // 模型状态
  currentModel: string;
  currentAnimation: AnimationType;
  currentExpression: ExpressionType;
  isVisible: boolean;
  modelScale: number;
  modelPosition: [number, number, number];

  // 语音状态
  isSpeaking: boolean;
  currentViseme: VisemeType;
  audioLevel: number;

  // MCP状态
  mcpConnected: boolean;
  activeTools: string[];
  lastCommand: string;

  // 性能监控
  performanceHistory: PerformanceMetrics[];
  lastPerformanceCheck: number;
}

/**
 * 3D角色操作
 */
export interface Character3DActions {
  // 渲染控制
  setRenderQuality: (quality: RenderQuality) => void;
  setIsLoaded: (loaded: boolean) => void;
  setVisible: (visible: boolean) => void;

  // 模型控制
  setCurrentModel: (modelPath: string) => void;
  setModelTransform: (scale?: number, position?: [number, number, number]) => void;

  // 动画控制
  playAnimation: (animationName: AnimationType, options?: AnimationOptions) => void;
  setExpression: (expressionName: ExpressionType, intensity?: number) => void;

  // 语音控制
  setSpeaking: (speaking: boolean, viseme?: VisemeType) => void;
  setAudioLevel: (level: number) => void;

  // MCP控制
  setMCPConnected: (connected: boolean) => void;
  addActiveTool: (toolName: string) => void;
  removeActiveTool: (toolName: string) => void;
  setLastCommand: (command: string) => void;

  // 性能监控
  updatePerformanceMetrics: (metrics: PerformanceMetrics) => void;
  getPerformanceStats: () => PerformanceStats;

  // 通用
  reset: () => void;
}

// ==================== 组件Props接口 ====================

/**
 * 3D画布组件Props
 */
export interface Character3DCanvasProps {
  modelPath?: string;
  enableControls?: boolean;
  transparent?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onModelLoaded?: (vrm: VRM | null) => void;
  onError?: (error: string) => void;
}

/**
 * VRM角色控制器Props
 */
export interface VRMCharacterControllerProps {
  modelPath: string;
  enablePhysics?: boolean;
  enableExpressions?: boolean;
  enableLookAt?: boolean;
  scale?: number;
  position?: [number, number, number];
  onModelLoaded?: (vrm: VRM | null) => void;
  onAnimationUpdate?: (vrm: VRM, deltaTime: number) => void;
  onError?: (error: string) => void;
}

/**
 * 3D虚拟角色主组件Props
 */
export interface VirtualCharacter3DProps {
  modelPath?: string;
  enableMCPIntegration?: boolean;
  enableVoiceSync?: boolean;
  enableControls?: boolean;
  transparent?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
  onError?: (error: string) => void;
}

/**
 * 动画选项
 */
export interface AnimationOptions {
  loop?: boolean;
  duration?: number;
  fadeInTime?: number;
  fadeOutTime?: number;
  playbackRate?: number;
  startTime?: number;
  weight?: number;
}

/**
 * 表情选项
 */
export interface ExpressionOptions {
  intensity?: number;
  duration?: number;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

/**
 * 性能统计
 */
export interface PerformanceStats {
  averageFPS: number;
  minFPS: number;
  maxFPS: number;
  averageMemory: number;
  maxMemory: number;
}

/**
 * 模型配置
 */
export interface ModelConfig {
  path: string;
  name: string;
  description?: string;
  scale?: number;
  position?: [number, number, number];
  animations?: AnimationConfig[];
  expressions?: ExpressionConfig[];
}

/**
 * 动画配置
 */
export interface AnimationConfig {
  name: string;
  type: AnimationType;
  file?: string;
  duration?: number;
  loop?: boolean;
  blendMode?: 'override' | 'additive';
}

/**
 * 表情配置
 */
export interface ExpressionConfig {
  name: string;
  type: ExpressionType;
  morphTargets?: MorphTargetConfig[];
}

/**
 * 变形目标配置
 */
export interface MorphTargetConfig {
  name: string;
  value: number;
}

/**
 * 物理配置
 */
export interface PhysicsConfig {
  enableSpringBone?: boolean;
  springStiffness?: number;
  springDamping?: number;
  gravityPower?: number;
  gravityDirection?: [number, number, number];
}

/**
 * LookAt配置
 */
export interface LookAtConfig {
  enable?: boolean;
  target?: [number, number, number];
  smoothTime?: number;
  maxYaw?: number;
  maxPitch?: number;
}

/**
 * 语音同步配置
 */
export interface VoiceSyncConfig {
  enableViseme?: boolean;
  visemeMapping?: Record<string, string>;
  audioAnalysis?: {
    enableRealtime?: boolean;
    smoothing?: number;
    sensitivity?: number;
  };
}

/**
 * MCP工具响应
 */
export interface MCPToolResponse {
  animation?: AnimationType;
  expression?: ExpressionType;
  speech?: string;
  duration?: number;
}

/**
 * 3D角色事件
 */
export interface Character3DEvents {
  onModelLoaded: (vrm: VRM | null) => void;
  onModelError: (error: string) => void;
  onAnimationStart: (animation: AnimationType) => void;
  onAnimationEnd: (animation: AnimationType) => void;
  onExpressionChange: (expression: ExpressionType, intensity: number) => void;
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onVisemeChange: (viseme: VisemeType) => void;
  onPerformanceWarning: (metrics: PerformanceMetrics) => void;
}

/**
 * 渲染配置
 */
export interface RenderConfig {
  antialias: boolean;
  pixelRatio: number;
  shadowMapSize: number;
  toneMapping: boolean;
  enableShadows?: boolean;
  enableSSAO?: boolean;
  enableBloom?: boolean;
}

/**
 * 3D环境配置
 */
export interface EnvironmentConfig {
  background?: {
    type: 'color' | 'texture' | 'skybox' | 'transparent';
    value?: string | string[]; // 颜色值或纹理路径
  };
  lighting?: {
    ambient?: {
      intensity: number;
      color?: string;
    };
    directional?: {
      intensity: number;
      color?: string;
      position: [number, number, number];
      castShadow?: boolean;
    };
    point?: Array<{
      intensity: number;
      color?: string;
      position: [number, number, number];
      distance?: number;
    }>;
  };
  fog?: {
    enable: boolean;
    color?: string;
    near?: number;
    far?: number;
  };
}