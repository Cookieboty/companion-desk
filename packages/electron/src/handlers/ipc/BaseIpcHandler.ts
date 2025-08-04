/**
 * IPC处理器基类
 * 提供统一的IPC处理器接口和公共功能
 */

import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { ILoggerService } from '../../services/LoggerService';

export abstract class BaseIpcHandler {
  protected logger: ILoggerService;
  protected registeredHandlers: Set<string> = new Set();

  constructor(logger: ILoggerService) {
    this.logger = logger;
  }

  /**
   * 初始化处理器，注册所有IPC事件
   */
  abstract initialize(): void;

  /**
   * 清理处理器，移除所有IPC事件监听
   */
  cleanup(): void {
    for (const channel of this.registeredHandlers) {
      ipcMain.removeAllListeners(channel);
    }
    this.registeredHandlers.clear();
    this.logger.info(`${this.constructor.name} 已清理`);
  }

  /**
   * 注册IPC事件处理器（异步）
   */
  protected registerHandler(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        this.logger.debug(`IPC请求: ${channel}`, { args });
        const result = await handler(event, ...args);
        this.logger.debug(`IPC响应: ${channel}`, { success: true });
        return result;
      } catch (error) {
        this.logger.error(`IPC处理失败: ${channel}`, {
          error: error.message,
          args,
          stack: error.stack
        });
        throw error;
      }
    });

    this.registeredHandlers.add(channel);
  }

  /**
   * 注册IPC事件监听器（同步）
   */
  protected registerListener(
    channel: string,
    handler: (event: IpcMainEvent, ...args: any[]) => void
  ): void {
    ipcMain.on(channel, (event, ...args) => {
      try {
        this.logger.debug(`IPC事件: ${channel}`, { args });
        handler(event, ...args);
      } catch (error) {
        this.logger.error(`IPC事件处理失败: ${channel}`, {
          error: error.message,
          args,
          stack: error.stack
        });
      }
    });

    this.registeredHandlers.add(channel);
  }

  /**
   * 验证参数
   */
  protected validateArgs(args: any[], requiredCount: number, types?: string[]): void {
    if (args.length < requiredCount) {
      throw new Error(`参数不足，需要${requiredCount}个参数，实际${args.length}个`);
    }

    if (types) {
      for (let i = 0; i < types.length; i++) {
        const expectedType = types[i];
        const actualType = typeof args[i];
        if (actualType !== expectedType) {
          throw new Error(`参数${i}类型错误，期望${expectedType}，实际${actualType}`);
        }
      }
    }
  }

  /**
   * 包装错误响应
   */
  protected createErrorResponse(error: Error): { success: false; error: string } {
    return {
      success: false,
      error: error.message
    };
  }

  /**
   * 包装成功响应
   */
  protected createSuccessResponse<T>(data?: T): { success: true; data?: T } {
    return {
      success: true,
      ...(data !== undefined && { data })
    };
  }

  /**
   * 获取处理器名称
   */
  getName(): string {
    return this.constructor.name;
  }

  /**
   * 获取已注册的通道列表
   */
  getRegisteredChannels(): string[] {
    return Array.from(this.registeredHandlers);
  }
}