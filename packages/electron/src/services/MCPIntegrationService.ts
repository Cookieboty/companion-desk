import { VirtualCharacterMCPServer } from '../mcp/VirtualCharacterMCPServer.js';
import { CursorIDEIntegration } from '../mcp/integration/CursorIDEIntegration.js';

/**
 * MCP集成服务
 * 在Electron主进程中管理MCP服务器的生命周期
 */
export class MCPIntegrationService {
  private mcpServer: VirtualCharacterMCPServer | null = null;
  private cursorIntegration: CursorIDEIntegration | null = null;
  private isRunning: boolean = false;

  constructor() {
    console.log('MCPIntegrationService: 服务已创建');
  }

  /**
   * 启动MCP集成服务
   */
  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        console.log('MCPIntegrationService: 服务已在运行中');
        return;
      }

      console.log('MCPIntegrationService: 启动MCP集成服务...');

      // 创建并初始化MCP服务器
      this.mcpServer = new VirtualCharacterMCPServer();
      await this.mcpServer.initialize();

      // 创建并初始化Cursor IDE集成
      this.cursorIntegration = new CursorIDEIntegration();
      await this.cursorIntegration.initialize();

      this.isRunning = true;

      console.log('✅ MCP集成服务启动成功');

      // 输出可用功能
      const tools = this.mcpServer.getTools();
      const resources = this.mcpServer.getResources();

      console.log(`📋 可用工具 (${tools.length}):`, tools.map(t => t.name).join(', '));
      console.log(`📚 可用资源 (${resources.length}):`, resources.map(r => r.name).join(', '));

    } catch (error) {
      console.error('MCPIntegrationService: 启动失败:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 停止MCP集成服务
   */
  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        console.log('MCPIntegrationService: 服务未在运行');
        return;
      }

      console.log('MCPIntegrationService: 停止MCP集成服务...');

      await this.cleanup();
      this.isRunning = false;

      console.log('✅ MCP集成服务已停止');
    } catch (error) {
      console.error('MCPIntegrationService: 停止失败:', error);
      throw error;
    }
  }

  /**
   * 重启MCP集成服务
   */
  async restart(): Promise<void> {
    console.log('MCPIntegrationService: 重启服务...');
    await this.stop();
    await this.start();
  }

  /**
   * 处理工具调用
   */
  async handleToolCall(toolName: string, args: any): Promise<any> {
    try {
      if (!this.mcpServer || !this.isRunning) {
        throw new Error('MCP服务器未运行');
      }

      console.log(`MCPIntegrationService: 处理工具调用 ${toolName}`);

      const result = await this.mcpServer.handleToolCall(toolName, args);

      console.log(`MCPIntegrationService: 工具调用 ${toolName} 完成`);
      return result;
    } catch (error) {
      console.error(`MCPIntegrationService: 工具调用 ${toolName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 处理资源读取
   */
  async handleResourceRead(uri: string): Promise<any> {
    try {
      if (!this.mcpServer || !this.isRunning) {
        throw new Error('MCP服务器未运行');
      }

      console.log(`MCPIntegrationService: 读取资源 ${uri}`);

      const result = await this.mcpServer.handleResourceRead(uri);

      console.log(`MCPIntegrationService: 资源读取 ${uri} 完成`);
      return result;
    } catch (error) {
      console.error(`MCPIntegrationService: 资源读取 ${uri} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): any[] {
    if (!this.mcpServer || !this.isRunning) {
      return [];
    }
    return this.mcpServer.getTools();
  }

  /**
   * 获取可用资源列表
   */
  getAvailableResources(): any[] {
    if (!this.mcpServer || !this.isRunning) {
      return [];
    }
    return this.mcpServer.getResources();
  }

  /**
   * 获取服务状态
   */
  getStatus(): MCPServiceStatus {
    return {
      isRunning: this.isRunning,
      mcpServerReady: this.mcpServer?.isReady() || false,
      cursorIntegrationReady: this.cursorIntegration?.getStatus().isRegistered || false,
      availableToolsCount: this.getAvailableTools().length,
      availableResourcesCount: this.getAvailableResources().length,
      lastCheck: Date.now()
    };
  }

  /**
   * 获取详细诊断信息
   */
  async getDiagnostics(): Promise<MCPDiagnostics> {
    const status = this.getStatus();

    let cursorDiagnostics = null;
    if (this.cursorIntegration) {
      try {
        cursorDiagnostics = await this.cursorIntegration.getDiagnostics();
      } catch (error) {
        console.error('获取Cursor诊断信息失败:', error);
      }
    }

    return {
      status,
      cursorIntegration: cursorDiagnostics,
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        pid: process.pid,
        workingDirectory: process.cwd(),
        timestamp: Date.now()
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        CHARACTER_MODEL_PATH: process.env.CHARACTER_MODEL_PATH,
        VOICE_ENGINE: process.env.VOICE_ENGINE,
        PERFORMANCE_MODE: process.env.PERFORMANCE_MODE
      }
    };
  }

  /**
   * 验证MCP配置
   */
  async validateConfiguration(): Promise<ConfigValidationResult> {
    try {
      const result: ConfigValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
      };

      // 检查MCP服务器状态
      if (!this.mcpServer) {
        result.errors.push('MCP服务器未初始化');
        result.isValid = false;
      } else if (!this.mcpServer.isReady()) {
        result.errors.push('MCP服务器未准备就绪');
        result.isValid = false;
      }

      // 检查Cursor集成
      if (this.cursorIntegration) {
        const cursorValidation = await this.cursorIntegration.validateConfiguration();
        result.errors.push(...cursorValidation.errors);
        result.warnings.push(...cursorValidation.warnings);

        if (!cursorValidation.isValid) {
          result.isValid = false;
        }
      } else {
        result.warnings.push('Cursor IDE集成未初始化');
      }

      return result;
    } catch (error) {
      return {
        isValid: false,
        errors: [`配置验证失败: ${error}`],
        warnings: []
      };
    }
  }

  /**
   * 检查服务是否运行
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.mcpServer) {
        await this.mcpServer.cleanup();
        this.mcpServer = null;
      }

      if (this.cursorIntegration) {
        await this.cursorIntegration.cleanup();
        this.cursorIntegration = null;
      }

      console.log('MCPIntegrationService: 资源清理完成');
    } catch (error) {
      console.error('MCPIntegrationService: 清理资源失败:', error);
    }
  }
}

/**
 * MCP服务状态接口
 */
export interface MCPServiceStatus {
  isRunning: boolean;
  mcpServerReady: boolean;
  cursorIntegrationReady: boolean;
  availableToolsCount: number;
  availableResourcesCount: number;
  lastCheck: number;
}

/**
 * MCP诊断信息接口
 */
export interface MCPDiagnostics {
  status: MCPServiceStatus;
  cursorIntegration: any;
  systemInfo: {
    platform: string;
    nodeVersion: string;
    electronVersion: string;
    chromeVersion: string;
    pid: number;
    workingDirectory: string;
    timestamp: number;
  };
  environment: {
    NODE_ENV?: string;
    CHARACTER_MODEL_PATH?: string;
    VOICE_ENGINE?: string;
    PERFORMANCE_MODE?: string;
  };
}

/**
 * 配置验证结果接口
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// 单例实例
let mcpIntegrationServiceInstance: MCPIntegrationService | null = null;

/**
 * 获取MCP集成服务单例
 */
export function getMCPIntegrationService(): MCPIntegrationService {
  if (!mcpIntegrationServiceInstance) {
    mcpIntegrationServiceInstance = new MCPIntegrationService();
  }
  return mcpIntegrationServiceInstance;
}