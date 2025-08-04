import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Cursor MCP配置生成器
 * 基于网络搜索结果，为Cursor IDE自动生成MCP配置
 */
export class CursorMCPSetup {
  private homeDir: string;
  private cursorConfigPath: string;
  private globalConfigPath: string;

  constructor() {
    this.homeDir = os.homedir();
    this.cursorConfigPath = path.join(this.homeDir, '.cursor', 'mcp.json');
    this.globalConfigPath = path.join(this.homeDir, '.cursor', 'mcp.json');
  }

  /**
   * 设置Cursor MCP集成
   */
  async setupCursorIntegration(): Promise<{ success: boolean; error?: string; configPath?: string }> {
    try {
      console.log('CursorMCPSetup: 开始设置Cursor MCP集成...');

      // 检查Cursor是否安装
      const cursorInstalled = await this.detectCursorInstallation();
      if (!cursorInstalled) {
        return {
          success: false,
          error: 'Cursor IDE未安装或无法检测到'
        };
      }

      // 生成MCP配置
      const mcpConfig = this.generateMCPConfig();

      // 确保.cursor目录存在
      await this.ensureCursorDirectory();

      // 写入配置文件
      await this.writeMCPConfig(mcpConfig);

      console.log('CursorMCPSetup: MCP配置已成功写入');

      return {
        success: true,
        configPath: this.cursorConfigPath
      };
    } catch (error) {
      console.error('CursorMCPSetup: 设置失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 检测Cursor IDE安装
   */
  private async detectCursorInstallation(): Promise<boolean> {
    try {
      const platform = process.platform;
      let cursorPaths: string[] = [];

      switch (platform) {
        case 'darwin': // macOS
          cursorPaths = [
            '/Applications/Cursor.app',
            path.join(this.homeDir, 'Applications', 'Cursor.app')
          ];
          break;
        case 'win32': // Windows
          cursorPaths = [
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Cursor'),
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Cursor'),
            path.join(this.homeDir, 'AppData', 'Local', 'Programs', 'Cursor')
          ];
          break;
        case 'linux': // Linux
          cursorPaths = [
            '/usr/bin/cursor',
            '/usr/local/bin/cursor',
            path.join(this.homeDir, '.local', 'bin', 'cursor')
          ];
          break;
        default:
          return false;
      }

      // 检查路径是否存在
      for (const cursorPath of cursorPaths) {
        try {
          await fs.access(cursorPath);
          console.log(`CursorMCPSetup: 发现Cursor安装路径: ${cursorPath}`);
          return true;
        } catch {
          // 继续检查下一个路径
        }
      }

      return false;
    } catch (error) {
      console.error('CursorMCPSetup: 检测Cursor安装失败:', error);
      return false;
    }
  }

  /**
   * 生成MCP配置
   * 基于官方文档格式：https://cursor-docs.apidog.io/model-context-protocol-896302m0
   */
  private generateMCPConfig(): any {
    // 获取当前应用的路径，用于启动MCP服务器
    const currentDir = process.cwd();
    const isDev = process.env.NODE_ENV === 'development';

    let mcpServerPath: string;
    if (isDev) {
      // 开发环境：直接使用构建后的文件
      mcpServerPath = path.join(currentDir, 'packages', 'electron', 'dist', 'standalone-mcp-server.js');
    } else {
      // 生产环境：使用打包后的资源路径
      mcpServerPath = path.join(process.resourcesPath, 'app', 'dist', 'standalone-mcp-server.js');
    }

    return {
      mcpServers: {
        'virtual-character': {
          command: 'node',
          args: [mcpServerPath],
          env: {
            NODE_ENV: isDev ? 'development' : 'production',
            MCP_SERVER_NAME: 'virtual-character',
            MCP_SERVER_VERSION: '1.0.0'
          }
        }
      }
    };
  }

  /**
   * 确保.cursor目录存在
   */
  private async ensureCursorDirectory(): Promise<void> {
    const cursorDir = path.dirname(this.cursorConfigPath);

    try {
      await fs.access(cursorDir);
    } catch {
      // 目录不存在，创建它
      await fs.mkdir(cursorDir, { recursive: true });
      console.log(`CursorMCPSetup: 创建目录: ${cursorDir}`);
    }
  }

  /**
   * 写入MCP配置文件
   */
  private async writeMCPConfig(config: any): Promise<void> {
    try {
      // 如果文件已存在，读取现有配置并合并
      let existingConfig = {};
      try {
        const existingContent = await fs.readFile(this.cursorConfigPath, 'utf-8');
        existingConfig = JSON.parse(existingContent);
      } catch {
        // 文件不存在或解析失败，使用空配置
      }

      // 合并配置
      const mergedConfig = {
        ...existingConfig,
        mcpServers: {
          ...(existingConfig as any).mcpServers || {},
          ...config.mcpServers
        }
      };

      // 写入文件
      await fs.writeFile(
        this.cursorConfigPath,
        JSON.stringify(mergedConfig, null, 2),
        'utf-8'
      );

      console.log(`CursorMCPSetup: 配置已写入: ${this.cursorConfigPath}`);
    } catch (error) {
      console.error('CursorMCPSetup: 写入配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取配置示例和使用说明
   */
  getUsageInstructions(): string {
    return `
# Cursor MCP集成使用说明

## 配置文件位置
- 全局配置: ~/.cursor/mcp.json  
- 项目配置: <project>/.cursor/mcp.json

## 可用工具

### 1. conversation-notification
对话完成后的通知工具
\`\`\`javascript
// 在Cursor中使用
conversation_notification({
  type: "voice",           // voice | sound | visual | all
  message: "代码解释完成", 
  urgency: "normal"        // low | normal | high
})
\`\`\`

### 2. explain_code  
代码解释工具
\`\`\`javascript
explain_code({
  code: "你的代码",
  language: "typescript"
})
\`\`\`

### 3. show_animation
显示3D角色动画
\`\`\`javascript 
show_animation({
  animation: "happy",
  duration: 3000
})
\`\`\`

## 重启Cursor IDE
配置完成后请重启Cursor IDE以生效。

## 故障排除
1. 确保Node.js已安装
2. 确保MCP服务器进程正在运行
3. 检查~/.cursor/mcp.json文件格式是否正确
`;
  }

  /**
   * 验证配置文件
   */
  async validateConfiguration(): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const content = await fs.readFile(this.cursorConfigPath, 'utf-8');
      const config = JSON.parse(content);

      const errors: string[] = [];

      if (!config.mcpServers) {
        errors.push('缺少mcpServers配置');
      }

      if (config.mcpServers && typeof config.mcpServers !== 'object') {
        errors.push('mcpServers应该是一个对象');
      }

      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`配置文件验证失败: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
}

export default CursorMCPSetup;