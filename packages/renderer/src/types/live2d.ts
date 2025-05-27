/**
 * Live2D相关类型定义
 */

// 从message.ts移植
export interface TimeConfig {
  /**
   * 时间段格式为 "HH-HH"，例如 "00-06" 表示从0点到6点
   */
  hour: string;
  /**
   * 在该时间段显示的消息
   */
  text: string;
}

/**
 * 时间配置数组
 */
export type Time = TimeConfig[];

// 从model.ts移植
export interface ModelConfig {
  /**
   * 模型配置文件路径
   */
  waifuPath: string;

  /**
   * API路径，用于从API加载模型（可选）
   */
  apiPath?: string;



  /**
   * Cubism2核心路径，用于加载Cubism2模型（可选）
   */
  cubism2Path?: string;

  /**
   * 默认模型ID（可选）
   */
  modelId?: number;

  /**
   * 要显示的工具列表（可选）
   */
  tools?: string[];

  /**
   * 是否支持拖动（可选）
   */
  drag?: boolean;

  /**
   * 日志级别（可选）
   */
  logLevel?: 'error' | 'warn' | 'info' | 'trace';
} 