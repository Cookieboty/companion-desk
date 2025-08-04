/**
 * IPC注册器 - 统一管理所有IPC处理器
 * 负责IPC处理器的注册、初始化和清理
 */

import { BaseIpcHandler } from './BaseIpcHandler';
import { WindowIpcHandler } from './WindowIpcHandler';
import { ConfigIpcHandler } from './ConfigIpcHandler';
import { FileIpcHandler } from './FileIpcHandler';
import { VoiceIpcHandler } from './VoiceIpcHandler';
import { AiChatIpcHandler } from './AiChatIpcHandler';
import { McpIpcHandler } from './McpIpcHandler';

import { ILoggerService } from '../../services/LoggerService';
import { IConfigService } from '../../services/ConfigService';
import { ICacheService } from '../../services/CacheService';
import { IWindowManager } from '../../core/WindowManager';

export interface IpcRegistryOptions {
  logger: ILoggerService;
  configService: IConfigService;
  cacheService?: ICacheService;
  windowManager: IWindowManager;
  mcpService?: any;
}

export interface IIpcRegistry {
  initialize(): void;
  cleanup(): void;
  getHandlers(): Map<string, BaseIpcHandler>;
  getHandler<T extends BaseIpcHandler>(name: string): T | undefined;
  registerHandler(name: string, handler: BaseIpcHandler): void;
  unregisterHandler(name: string): boolean;
}

export class IpcRegistry implements IIpcRegistry {
  private handlers = new Map<string, BaseIpcHandler>();
  private options: IpcRegistryOptions;
  private isInitialized = false;

  constructor(options: IpcRegistryOptions) {
    this.options = options;
  }

  /**
   * 初始化所有IPC处理器
   */
  initialize(): void {
    if (this.isInitialized) {
      this.options.logger.warn('IPC注册器已经初始化');
      return;
    }

    try {
      this.options.logger.info('开始初始化IPC处理器...');

      // 注册窗口处理器
      const windowHandler = new WindowIpcHandler(
        this.options.logger,
        this.options.windowManager
      );
      this.registerHandler('window', windowHandler);

      // 注册配置处理器
      const configHandler = new ConfigIpcHandler(
        this.options.logger,
        this.options.configService
      );
      this.registerHandler('config', configHandler);

      // 注册文件处理器
      const fileHandler = new FileIpcHandler(
        this.options.logger,
        this.options.cacheService
      );
      this.registerHandler('file', fileHandler);

      // 注册语音处理器
      const voiceHandler = new VoiceIpcHandler(
        this.options.logger,
        this.options.configService
      );
      this.registerHandler('voice', voiceHandler);

      // 注册AI对话处理器
      const aiChatHandler = new AiChatIpcHandler(
        this.options.logger
      );
      this.registerHandler('aiChat', aiChatHandler);

      // 注册MCP处理器
      const mcpHandler = new McpIpcHandler(
        this.options.logger,
        this.options.mcpService
      );
      this.registerHandler('mcp', mcpHandler);

      // 初始化所有处理器
      for (const [name, handler] of this.handlers) {
        try {
          handler.initialize();
          this.options.logger.info(`IPC处理器初始化成功: ${name}`, {
            channels: handler.getRegisteredChannels().length
          });
        } catch (error) {
          this.options.logger.error(`IPC处理器初始化失败: ${name}`, {
            error: error.message
          });
          // 继续初始化其他处理器，不因单个失败而停止
        }
      }

      this.isInitialized = true;
      this.options.logger.info('IPC注册器初始化完成', {
        handlerCount: this.handlers.size,
        totalChannels: this.getTotalChannelCount()
      });

    } catch (error) {
      this.options.logger.error('IPC注册器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 清理所有IPC处理器
   */
  cleanup(): void {
    if (!this.isInitialized) {
      return;
    }

    try {
      this.options.logger.info('开始清理IPC处理器...');

      // 清理所有处理器
      for (const [name, handler] of this.handlers) {
        try {
          handler.cleanup();
          this.options.logger.debug(`IPC处理器清理完成: ${name}`);
        } catch (error) {
          this.options.logger.error(`IPC处理器清理失败: ${name}`, {
            error: error.message
          });
        }
      }

      this.handlers.clear();
      this.isInitialized = false;

      this.options.logger.info('IPC注册器清理完成');

    } catch (error) {
      this.options.logger.error('IPC注册器清理失败', { error: error.message });
    }
  }

  /**
   * 获取所有处理器
   */
  getHandlers(): Map<string, BaseIpcHandler> {
    return new Map(this.handlers);
  }

  /**
   * 获取特定处理器
   */
  getHandler<T extends BaseIpcHandler>(name: string): T | undefined {
    return this.handlers.get(name) as T | undefined;
  }

  /**
   * 注册处理器
   */
  registerHandler(name: string, handler: BaseIpcHandler): void {
    if (this.handlers.has(name)) {
      this.options.logger.warn(`IPC处理器已存在，将被替换: ${name}`);
      // 清理旧的处理器
      const oldHandler = this.handlers.get(name);
      if (oldHandler) {
        oldHandler.cleanup();
      }
    }

    this.handlers.set(name, handler);
    this.options.logger.debug(`IPC处理器已注册: ${name}`);

    // 如果注册器已初始化，立即初始化新处理器
    if (this.isInitialized) {
      try {
        handler.initialize();
        this.options.logger.info(`动态注册的IPC处理器初始化成功: ${name}`);
      } catch (error) {
        this.options.logger.error(`动态注册的IPC处理器初始化失败: ${name}`, {
          error: error.message
        });
      }
    }
  }

  /**
   * 注销处理器
   */
  unregisterHandler(name: string): boolean {
    const handler = this.handlers.get(name);
    if (!handler) {
      this.options.logger.warn(`尝试注销不存在的IPC处理器: ${name}`);
      return false;
    }

    try {
      handler.cleanup();
      this.handlers.delete(name);
      this.options.logger.info(`IPC处理器已注销: ${name}`);
      return true;
    } catch (error) {
      this.options.logger.error(`注销IPC处理器失败: ${name}`, {
        error: error.message
      });
      return false;
    }
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    handlerCount: number;
    totalChannels: number;
    handlers: Array<{
      name: string;
      type: string;
      channels: number;
      channelList: string[];
    }>;
  } {
    const handlers = Array.from(this.handlers.entries()).map(([name, handler]) => ({
      name,
      type: handler.getName(),
      channels: handler.getRegisteredChannels().length,
      channelList: handler.getRegisteredChannels()
    }));

    return {
      handlerCount: this.handlers.size,
      totalChannels: this.getTotalChannelCount(),
      handlers
    };
  }

  /**
   * 重新加载所有处理器
   */
  reload(): void {
    this.options.logger.info('重新加载IPC注册器...');
    this.cleanup();
    this.initialize();
  }

  /**
   * 验证处理器状态
   */
  validateHandlers(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    for (const [name, handler] of this.handlers) {
      try {
        // 检查处理器是否正常
        const channels = handler.getRegisteredChannels();
        if (channels.length === 0) {
          issues.push(`处理器 ${name} 没有注册任何通道`);
        }

        // 检查是否有重复的通道
        const channelSet = new Set();
        for (const channel of channels) {
          if (channelSet.has(channel)) {
            issues.push(`发现重复的通道: ${channel} (处理器: ${name})`);
          }
          channelSet.add(channel);
        }

      } catch (error) {
        issues.push(`处理器 ${name} 验证失败: ${error.message}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * 获取总通道数
   */
  private getTotalChannelCount(): number {
    let total = 0;
    for (const handler of this.handlers.values()) {
      total += handler.getRegisteredChannels().length;
    }
    return total;
  }

  /**
   * 设置MCP服务（动态更新）
   */
  setMcpService(mcpService: any): void {
    const mcpHandler = this.getHandler<McpIpcHandler>('mcp');
    if (mcpHandler) {
      mcpHandler.setMcpService(mcpService);
      this.options.logger.info('MCP服务已更新到MCP处理器');
    } else {
      this.options.logger.warn('MCP处理器不存在，无法设置MCP服务');
    }
  }
}