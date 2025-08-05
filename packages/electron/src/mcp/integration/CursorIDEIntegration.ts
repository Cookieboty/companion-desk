import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Cursor IDE集成管理器
 * 实现MCP服务器在Cursor IDE中的自动发现和注册机制
 */
export class CursorIDEIntegration {
  private configPath: string;
  private serverConfig: MCPServerConfig;
  private isRegistered: boolean = false;

  constructor() {
    this.configPath = this.detectCursorConfigPath();
    this.serverConfig = this.createServerConfig();
  }

  /**
   * 初始化Cursor IDE集成
   */
  async initialize(): Promise<void> {
    try {
      console.log('CursorIDEIntegration: 开始初始化...');

      // 检测Cursor IDE环境
      const cursorDetected = await this.detectCursorEnvironment();
      if (!cursorDetected) {
        console.log('CursorIDEIntegration: 未检测到Cursor IDE环境');
        return;
      }

      // 注册MCP服务器
      await this.registerMCPServer();

      console.log('CursorIDEIntegration: 初始化完成');
    } catch (error) {
      console.error('CursorIDEIntegration: 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 检测Cursor IDE环境
   */
  private async detectCursorEnvironment(): Promise<boolean> {
    try {
      // 检查环境变量
      if (process.env.CURSOR_MODE === 'true' || process.env.VSCODE_PID) {
        return true;
      }

      // 检查Cursor配置目录是否存在
      const configDir = path.dirname(this.configPath);
      try {
        await fs.access(configDir);
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('检测Cursor环境失败:', error);
      return false;
    }
  }

  /**
   * 注册MCP服务器到Cursor IDE
   */
  async registerMCPServer(): Promise<void> {
    try {
      console.log('CursorIDEIntegration: 注册MCP服务器到Cursor IDE...');

      // 加载现有配置
      let config = await this.loadCursorConfig();

      // 确保mcpServers配置存在
      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      // 注册虚拟角色MCP服务器
      config.mcpServers['virtual-character-3d'] = this.serverConfig;

      // 保存配置
      await this.saveCursorConfig(config);

      this.isRegistered = true;
      console.log('✅ 3D虚拟人物MCP服务器已注册到Cursor IDE');

      // 尝试通知Cursor IDE重新加载配置
      await this.notifyCursorReload();

    } catch (error) {
      console.error('CursorIDEIntegration: 注册MCP服务器失败:', error);
      throw error;
    }
  }

  /**
   * 检测Cursor配置路径
   */
  private detectCursorConfigPath(): string {
    const platform = process.platform;
    const homeDir = os.homedir();

    const configPaths: Record<string, string> = {
      win32: path.join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'cursor.mcp-config.json'),
      darwin: path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'cursor.mcp-config.json'),
      linux: path.join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'cursor.mcp-config.json')
    };

    // 备选路径
    const alternatePaths: Record<string, string[]> = {
      win32: [
        path.join(homeDir, 'AppData', 'Roaming', 'Cursor', 'mcp.json'),
        path.join(homeDir, 'AppData', 'Local', 'Cursor', 'mcp.json')
      ],
      darwin: [
        path.join(homeDir, 'Library', 'Preferences', 'Cursor', 'mcp.json'),
        path.join(homeDir, '.cursor', 'mcp.json')
      ],
      linux: [
        path.join(homeDir, '.cursor', 'mcp.json'),
        path.join(homeDir, '.local', 'share', 'Cursor', 'mcp.json')
      ]
    };

    const primaryPath = configPaths[platform] || configPaths.linux;
    console.log(`CursorIDEIntegration: 主要配置路径: ${primaryPath}`);

    return primaryPath;
  }

  /**
   * 创建MCP服务器配置
   */
  private createServerConfig(): MCPServerConfig {
    const serverPath = this.getServerExecutablePath();

    return {
      command: 'node',
      args: [serverPath],
      env: {
        CHARACTER_MODEL_PATH: this.getDefaultModelPath(),
        VOICE_ENGINE: 'enhanced',
        PERFORMANCE_MODE: 'balanced',
        NODE_ENV: process.env.NODE_ENV || 'production'
      },
      workingDirectory: process.cwd(),
      timeout: 30000, // 30秒超时
      capabilities: {
        tools: true,
        resources: true,
        prompts: false
      },
      metadata: {
        name: '3D虚拟人物智能助手',
        description: '提供代码解释、动画演示、语音反馈和手势引导的3D虚拟角色',
        version: '1.0.0',
        author: 'Virtual Character Team',
        homepage: 'https://github.com/virtual-character/3d-assistant'
      }
    };
  }

  /**
   * 获取服务器可执行文件路径
   */
  private getServerExecutablePath(): string {
    // 在生产环境中，这应该指向打包后的MCP服务器入口文件
    const isDev = process.env.NODE_ENV === 'development';
    const isDebugBuild = process.env.DEBUG === 'true';

    if (isDev) {
      // 获取项目根目录的绝对路径，避免因工作目录不同导致路径错误
      const projectRoot = this.getProjectRoot();
      return path.join(projectRoot, 'packages', 'electron', 'dist', 'standalone-mcp-server.js');
    } else if (isDebugBuild) {
      // Debug构建：asar被禁用，文件在app目录下
      return path.join(process.resourcesPath, 'app', 'dist', 'standalone-mcp-server.js');
    } else {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'standalone-mcp-server.js');
    }
  }

  /**
   * 获取项目根目录路径
   */
  private getProjectRoot(): string {
    // 从当前文件路径向上查找，直到找到包含 package.json 和 pnpm-workspace.yaml 的目录
    let currentDir = __dirname;

    while (currentDir !== path.dirname(currentDir)) {
      const packageJsonPath = path.join(currentDir, 'package.json');
      const workspaceConfigPath = path.join(currentDir, 'pnpm-workspace.yaml');

      if (require('fs').existsSync(packageJsonPath) && require('fs').existsSync(workspaceConfigPath)) {
        return currentDir;
      }

      currentDir = path.dirname(currentDir);
    }

    // 如果找不到，回退到 process.cwd()
    return process.cwd();
  }

  /**
   * 获取默认模型路径
   */
  private getDefaultModelPath(): string {
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      return path.join(process.cwd(), 'packages', 'renderer', 'public', 'assets', 'models');
    } else {
      return path.join(process.resourcesPath, 'renderer', 'assets', 'models');
    }
  }

  /**
   * 加载Cursor配置
   */
  private async loadCursorConfig(): Promise<CursorConfig> {
    try {
      // 确保配置目录存在
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // 尝试读取现有配置
      try {
        const configContent = await fs.readFile(this.configPath, 'utf-8');
        return JSON.parse(configContent);
      } catch (readError) {
        // 如果文件不存在或解析失败，返回默认配置
        console.log('CursorIDEIntegration: 创建新的配置文件');
        return {
          mcpServers: {},
          version: '1.0.0',
          lastModified: Date.now()
        };
      }
    } catch (error) {
      console.error('加载Cursor配置失败:', error);
      throw error;
    }
  }

  /**
   * 保存Cursor配置
   */
  private async saveCursorConfig(config: CursorConfig): Promise<void> {
    try {
      // 更新修改时间
      config.lastModified = Date.now();

      // 格式化JSON输出
      const configContent = JSON.stringify(config, null, 2);

      // 原子写入（先写入临时文件，再重命名）
      const tempPath = `${this.configPath}.tmp`;
      await fs.writeFile(tempPath, configContent, 'utf-8');
      await fs.rename(tempPath, this.configPath);

      console.log(`CursorIDEIntegration: 配置已保存到 ${this.configPath}`);
    } catch (error) {
      console.error('保存Cursor配置失败:', error);
      throw error;
    }
  }

  /**
   * 通知Cursor IDE重新加载配置
   */
  private async notifyCursorReload(): Promise<void> {
    try {
      // 这里可以实现与Cursor IDE的通信机制
      // 目前只是记录日志，实际的重载可能需要用户重启Cursor
      console.log('CursorIDEIntegration: 请重启Cursor IDE以加载新的MCP服务器配置');
    } catch (error) {
      console.warn('通知Cursor重新加载失败:', error);
    }
  }

  /**
   * 取消注册MCP服务器
   */
  async unregisterMCPServer(): Promise<void> {
    try {
      console.log('CursorIDEIntegration: 取消注册MCP服务器...');

      const config = await this.loadCursorConfig();

      if (config.mcpServers && config.mcpServers['virtual-character-3d']) {
        delete config.mcpServers['virtual-character-3d'];
        await this.saveCursorConfig(config);
        this.isRegistered = false;
        console.log('CursorIDEIntegration: MCP服务器已取消注册');
      }
    } catch (error) {
      console.error('CursorIDEIntegration: 取消注册失败:', error);
    }
  }

  /**
   * 验证配置有效性
   */
  async validateConfiguration(): Promise<ValidationResult> {
    try {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
      };

      // 检查服务器可执行文件
      const serverPath = this.getServerExecutablePath();
      try {
        await fs.access(serverPath);
      } catch {
        result.isValid = false;
        result.errors.push(`MCP服务器文件不存在: ${serverPath}`);
      }

      // 检查模型路径
      const modelPath = this.getDefaultModelPath();
      try {
        await fs.access(modelPath);
      } catch {
        result.warnings.push(`默认模型路径不存在: ${modelPath}`);
      }

      // 检查Cursor配置文件
      try {
        await this.loadCursorConfig();
      } catch {
        result.warnings.push('Cursor配置文件访问异常');
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
   * 获取集成状态
   */
  getStatus(): IntegrationStatus {
    return {
      isRegistered: this.isRegistered,
      configPath: this.configPath,
      serverConfig: this.serverConfig,
      lastCheck: Date.now()
    };
  }

  /**
   * 获取诊断信息
   */
  async getDiagnostics(): Promise<DiagnosticInfo> {
    const validation = await this.validateConfiguration();
    const status = this.getStatus();

    return {
      platform: process.platform,
      nodeVersion: process.version,
      configPath: this.configPath,
      serverPath: this.getServerExecutablePath(),
      modelPath: this.getDefaultModelPath(),
      isRegistered: this.isRegistered,
      validation,
      timestamp: Date.now()
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      console.log('CursorIDEIntegration: 清理资源...');

      if (this.isRegistered) {
        await this.unregisterMCPServer();
      }

      console.log('CursorIDEIntegration: 清理完成');
    } catch (error) {
      console.error('CursorIDEIntegration: 清理失败:', error);
    }
  }
}

/**
 * MCP服务器配置接口
 */
interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  workingDirectory: string;
  timeout: number;
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
  };
  metadata: {
    name: string;
    description: string;
    version: string;
    author: string;
    homepage: string;
  };
}

/**
 * Cursor配置接口
 */
interface CursorConfig {
  mcpServers: Record<string, MCPServerConfig>;
  version: string;
  lastModified: number;
}

/**
 * 验证结果接口
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 集成状态接口
 */
interface IntegrationStatus {
  isRegistered: boolean;
  configPath: string;
  serverConfig: MCPServerConfig;
  lastCheck: number;
}

/**
 * 诊断信息接口
 */
interface DiagnosticInfo {
  platform: string;
  nodeVersion: string;
  configPath: string;
  serverPath: string;
  modelPath: string;
  isRegistered: boolean;
  validation: ValidationResult;
  timestamp: number;
}