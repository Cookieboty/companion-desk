/**
 * MCP工具基础适配器接口
 * 定义所有MCP工具必须实现的基本接口
 */
export abstract class BaseAdapter {
  protected name: string;
  protected description: string;
  protected version: string;

  constructor(name: string, description: string, version: string = '1.0.0') {
    this.name = name;
    this.description = description;
    this.version = version;
  }

  /**
   * 执行工具
   * @param args 工具参数
   * @returns 执行结果
   */
  abstract execute(args: any): Promise<ToolResult>;

  /**
   * 获取工具描述
   */
  getDescription(): string {
    return this.description;
  }

  /**
   * 获取工具名称
   */
  getName(): string {
    return this.name;
  }

  /**
   * 获取工具版本
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * 获取输入参数模式
   */
  abstract getInputSchema(): any;

  /**
   * 验证输入参数
   * @param args 输入参数
   * @returns 验证结果
   */
  protected validateInput(args: any): ValidationResult {
    try {
      const schema = this.getInputSchema();

      // 基础验证
      if (!args || typeof args !== 'object') {
        return {
          isValid: false,
          error: '参数必须是一个对象'
        };
      }

      // 检查必需字段
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in args)) {
            return {
              isValid: false,
              error: `缺少必需参数: ${field}`
            };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `参数验证失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 清理资源（可选实现）
   */
  async cleanup?(): Promise<void>;

  /**
   * 获取工具状态（可选实现）
   */
  getStatus?(): ToolStatus;
}

/**
 * 工具执行结果接口
 */
export interface ToolResult {
  success: boolean;
  content: string;
  metadata?: {
    timestamp: number;
    duration?: number;
    characterResponse?: CharacterResponse;
    [key: string]: any;
  };
  error?: string;
}

/**
 * 3D角色响应接口
 */
export interface CharacterResponse {
  animation?: string;
  expression?: string;
  speech?: string;
  gesture?: string;
  lookAt?: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * 参数验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * 工具状态接口
 */
export interface ToolStatus {
  isReady: boolean;
  lastUsed?: number;
  errorCount: number;
  averageExecutionTime?: number;
}