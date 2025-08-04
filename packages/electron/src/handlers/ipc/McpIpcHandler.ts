/**
 * MCP相关IPC处理器
 * 处理MCP工具调用、资源读取等相关的IPC通信
 */

import { BaseIpcHandler } from './BaseIpcHandler';
import { ILoggerService } from '../../services/LoggerService';

// MCP服务接口（简化版）
interface MCPService {
  getStatus(): any;
  getDiagnostics(): Promise<any>;
  handleToolCall(toolName: string, args: any): Promise<any>;
  handleResourceRead(uri: string): Promise<any>;
  getAvailableTools(): any[];
  getAvailableResources(): any[];
  restart(): Promise<void>;
  validateConfiguration(): Promise<any>;
}

export class McpIpcHandler extends BaseIpcHandler {
  private mcpService?: MCPService;

  constructor(logger: ILoggerService, mcpService?: MCPService) {
    super(logger);
    this.mcpService = mcpService;
  }

  /**
   * 初始化MCP相关IPC处理器
   */
  initialize(): void {
    // 获取MCP服务状态
    this.registerHandler('mcp:getStatus', async () => {
      try {
        if (!this.mcpService) {
          this.logger.warn('MCP服务不可用');
          return { isRunning: false, error: 'MCP服务未初始化' };
        }

        const status = this.mcpService.getStatus();
        this.logger.debug('获取MCP状态', { status });
        return status;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取MCP状态失败', { error: errorMessage });
        return { isRunning: false, error: errorMessage };
      }
    });

    // 获取MCP诊断信息
    this.registerHandler('mcp:getDiagnostics', async () => {
      try {
        if (!this.mcpService) {
          this.logger.warn('MCP服务不可用');
          return { error: 'MCP服务未初始化' };
        }

        const diagnostics = await this.mcpService.getDiagnostics();
        this.logger.debug('获取MCP诊断信息', { diagnostics });
        return diagnostics;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取MCP诊断信息失败', { error: errorMessage });
        return { error: errorMessage };
      }
    });

    // 调用MCP工具
    this.registerHandler('mcp:callTool', async (_, toolName: string, args: any) => {
      this.validateArgs([toolName, args], 2, ['string']);

      try {
        if (!this.mcpService) {
          throw new Error('MCP服务未初始化');
        }

        this.logger.info(`调用MCP工具: ${toolName}`, { args });
        const result = await this.mcpService.handleToolCall(toolName, args);
        this.logger.info(`MCP工具调用完成: ${toolName}`);

        return result;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`MCP工具调用失败: ${toolName}`, { error: errorMessage, args });
        throw error;
      }
    });

    // 读取MCP资源
    this.registerHandler('mcp:readResource', async (_, uri: string) => {
      this.validateArgs([uri], 1, ['string']);

      try {
        if (!this.mcpService) {
          throw new Error('MCP服务未初始化');
        }

        this.logger.info(`读取MCP资源: ${uri}`);
        const result = await this.mcpService.handleResourceRead(uri);
        this.logger.info(`MCP资源读取完成: ${uri}`);

        return result;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`MCP资源读取失败: ${uri}`, { error: errorMessage });
        throw error;
      }
    });

    // 获取可用MCP工具列表
    this.registerHandler('mcp:getAvailableTools', async () => {
      try {
        if (!this.mcpService) {
          this.logger.warn('MCP服务不可用');
          return [];
        }

        const tools = this.mcpService.getAvailableTools();
        this.logger.debug('获取可用MCP工具列表', { toolCount: tools.length });
        return tools;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取MCP工具列表失败', { error: errorMessage });
        return [];
      }
    });

    // 获取可用MCP资源列表
    this.registerHandler('mcp:getAvailableResources', async () => {
      try {
        if (!this.mcpService) {
          this.logger.warn('MCP服务不可用');
          return [];
        }

        const resources = this.mcpService.getAvailableResources();
        this.logger.debug('获取可用MCP资源列表', { resourceCount: resources.length });
        return resources;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取MCP资源列表失败', { error: errorMessage });
        return [];
      }
    });

    // 重启MCP服务
    this.registerHandler('mcp:restart', async () => {
      try {
        if (!this.mcpService) {
          throw new Error('MCP服务未初始化');
        }

        this.logger.info('重启MCP服务...');
        await this.mcpService.restart();
        this.logger.info('MCP服务重启完成');

        return this.createSuccessResponse();

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('MCP服务重启失败', { error: errorMessage });
        return this.createErrorResponse(error);
      }
    });

    // 验证MCP配置
    this.registerHandler('mcp:validateConfiguration', async () => {
      try {
        if (!this.mcpService) {
          this.logger.warn('MCP服务不可用');
          return { isValid: false, errors: ['MCP服务未初始化'], warnings: [] };
        }

        const validation = await this.mcpService.validateConfiguration();
        this.logger.debug('MCP配置验证结果', { validation });
        return validation;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('MCP配置验证失败', { error: errorMessage });
        return { isValid: false, errors: [errorMessage], warnings: [] };
      }
    });

    // Cursor MCP配置注入
    this.registerHandler('mcp:setupCursorIntegration', async () => {
      try {
        this.logger.info('开始处理Cursor MCP配置注入...');

        // 动态导入CursorMCPSetup
        const { CursorMCPSetup } = await import('../../mcp/integration/CursorMCPSetup');
        const cursorSetup = new CursorMCPSetup();
        const result = await cursorSetup.setupCursorIntegration();

        this.logger.info('Cursor MCP配置注入完成', { result });
        return result;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Cursor MCP配置注入失败', { error: errorMessage });
        return {
          success: false,
          error: errorMessage
        };
      }
    });

    // 获取MCP工具详细信息
    this.registerHandler('mcp:getToolInfo', async (_, toolName: string) => {
      this.validateArgs([toolName], 1, ['string']);

      try {
        if (!this.mcpService) {
          return null;
        }

        const tools = this.mcpService.getAvailableTools();
        const tool = tools.find(t => t.name === toolName);

        if (tool) {
          this.logger.debug('获取MCP工具详细信息', { toolName, tool });
        } else {
          this.logger.warn('MCP工具不存在', { toolName });
        }

        return tool || null;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取MCP工具详细信息失败', { error: errorMessage, toolName });
        return null;
      }
    });

    // 获取MCP资源详细信息
    this.registerHandler('mcp:getResourceInfo', async (_, resourceName: string) => {
      this.validateArgs([resourceName], 1, ['string']);

      try {
        if (!this.mcpService) {
          return null;
        }

        const resources = this.mcpService.getAvailableResources();
        const resource = resources.find(r => r.name === resourceName);

        if (resource) {
          this.logger.debug('获取MCP资源详细信息', { resourceName, resource });
        } else {
          this.logger.warn('MCP资源不存在', { resourceName });
        }

        return resource || null;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取MCP资源详细信息失败', { error: errorMessage, resourceName });
        return null;
      }
    });

    // 检查MCP服务健康状态
    this.registerHandler('mcp:checkHealth', async () => {
      try {
        if (!this.mcpService) {
          return {
            healthy: false,
            issues: ['MCP服务未初始化'],
            timestamp: Date.now()
          };
        }

        // 获取状态和诊断信息
        const status = this.mcpService.getStatus();
        const diagnostics = await this.mcpService.getDiagnostics();

        const issues: string[] = [];

        if (!status.isRunning) {
          issues.push('MCP服务未运行');
        }

        if (diagnostics.error) {
          issues.push(`诊断错误: ${diagnostics.error}`);
        }

        const health = {
          healthy: issues.length === 0,
          issues,
          status,
          diagnostics,
          timestamp: Date.now()
        };

        this.logger.debug('MCP服务健康检查', { health });
        return health;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('MCP健康检查失败', { error: errorMessage });
        return {
          healthy: false,
          issues: [`健康检查失败: ${errorMessage}`],
          timestamp: Date.now()
        };
      }
    });

    // 获取MCP服务统计信息
    this.registerHandler('mcp:getStats', async () => {
      try {
        if (!this.mcpService) {
          return {
            toolCount: 0,
            resourceCount: 0,
            isAvailable: false
          };
        }

        const tools = this.mcpService.getAvailableTools();
        const resources = this.mcpService.getAvailableResources();

        const stats = {
          toolCount: tools.length,
          resourceCount: resources.length,
          isAvailable: true,
          uptime: Date.now() // 简化的运行时间
        };

        this.logger.debug('获取MCP服务统计信息', { stats });
        return stats;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取MCP统计信息失败', { error: errorMessage });
        return {
          toolCount: 0,
          resourceCount: 0,
          isAvailable: false,
          error: errorMessage
        };
      }
    });

    this.logger.info('McpIpcHandler 初始化完成', {
      registeredChannels: this.getRegisteredChannels().length,
      mcpServiceAvailable: !!this.mcpService
    });
  }

  /**
   * 设置MCP服务实例
   */
  setMcpService(mcpService: MCPService): void {
    this.mcpService = mcpService;
    this.logger.info('MCP服务实例已设置');
  }

  /**
   * 获取MCP服务状态
   */
  isMcpServiceAvailable(): boolean {
    return !!this.mcpService;
  }
}