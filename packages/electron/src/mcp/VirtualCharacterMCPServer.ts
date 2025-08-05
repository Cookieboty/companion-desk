import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  Tool,
  Resource,
  CallToolResult,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { BaseAdapter } from './tools/BaseAdapter.js';
import { MCPSecurityManager } from './security/MCPSecurityManager.js';
import { MCPToolRegistry } from './MCPToolRegistry.js';

/**
 * 对话通知MCP服务器
 * 实现Model Context Protocol，为Cursor IDE提供对话通知功能
 */
export class VirtualCharacterMCPServer {
  private tools: Map<string, BaseAdapter>;
  private securityManager: MCPSecurityManager;
  private toolRegistry: MCPToolRegistry;
  private isInitialized: boolean = false;
  private server: Server;

  constructor() {
    this.tools = new Map();
    this.securityManager = new MCPSecurityManager();
    this.toolRegistry = new MCPToolRegistry();

    // 创建MCP服务器实例
    this.server = new Server(
      {
        name: 'conversation-notification',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * 设置MCP处理器
   */
  private setupHandlers(): void {
    // 处理工具列表请求
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [];

      for (const [name, adapter] of this.tools) {
        tools.push({
          name,
          description: adapter.getDescription(),
          inputSchema: adapter.getInputSchema()
        });
      }

      console.log(`VirtualCharacterMCPServer: 返回工具列表，共${tools.length}个工具`);
      return { tools };
    });

    // 处理工具调用请求
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.log(`VirtualCharacterMCPServer: 调用工具 ${name}`, args);

      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        const result = await tool.execute(args || {});

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        console.error(`VirtualCharacterMCPServer: 工具执行失败:`, error);

        return {
          content: [
            {
              type: 'text',
              text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        };
      }
    });

    // 处理资源列表请求
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = this.getResources();
      console.log(`VirtualCharacterMCPServer: 返回资源列表，共${resources.length}个资源`);
      return { resources };
    });

    // 处理资源读取请求
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      console.log(`VirtualCharacterMCPServer: 读取资源 ${uri}`);

      // 简单的资源处理逻辑
      if (uri === 'virtual-character://status') {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                status: 'running',
                tools: this.tools.size,
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }

      throw new Error(`Resource not found: ${uri}`);
    });
  }

  /**
   * 启动MCP服务器
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.log('VirtualCharacterMCPServer: MCP服务器已启动');
  }

  /**
   * 获取服务器实例
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * 初始化MCP服务器
   */
  async initialize(): Promise<void> {
    try {
      console.log('VirtualCharacterMCPServer: 开始初始化...');

      // 注册基础工具
      await this.registerTools();

      // 初始化安全管理器
      await this.securityManager.initialize();

      this.isInitialized = true;
      console.log('VirtualCharacterMCPServer: 初始化完成');
    } catch (error) {
      console.error('VirtualCharacterMCPServer: 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 注册MCP工具
   */
  private async registerTools(): Promise<void> {
    try {
      console.log('VirtualCharacterMCPServer: 注册工具...');

      // 所有工具已移至standalone-mcp-server.ts，这里不再注册工具

      console.log('VirtualCharacterMCPServer: 工具注册完成，总数:', this.tools.size);

      // 输出每个工具的详细信息
      for (const [name, tool] of this.tools) {
        console.log(`  - ${name}: ${tool.getDescription()}`);
      }
    } catch (error) {
      console.error('VirtualCharacterMCPServer: 工具注册失败:', error);
      throw error;
    }
  }

  /**
   * 获取可用工具列表
   */
  getTools(): Tool[] {
    const tools: Tool[] = [];

    for (const [name, adapter] of this.tools) {
      tools.push({
        name,
        description: adapter.getDescription(),
        inputSchema: adapter.getInputSchema()
      });
    }

    return tools;
  }

  /**
   * 获取可用资源列表
   */
  getResources(): Resource[] {
    return [
      {
        uri: 'virtual-character://status',
        name: '3D虚拟人物状态',
        description: '获取当前3D虚拟人物的状态信息',
        mimeType: 'application/json'
      },
      {
        uri: 'virtual-character://capabilities',
        name: '功能清单',
        description: '获取3D虚拟人物的完整功能清单',
        mimeType: 'application/json'
      }
    ];
  }

  /**
   * 处理工具调用
   */
  async handleToolCall(name: string, args: any): Promise<CallToolResult> {
    try {
      console.log(`VirtualCharacterMCPServer: 处理工具调用 ${name}`, args);

      // 安全验证
      const isValid = await this.securityManager.validateToolCall(name, args);
      if (!isValid) {
        throw new Error(`工具调用安全验证失败: ${name}`);
      }

      // 获取工具
      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`未知工具: ${name}`);
      }

      // 执行工具
      const result = await tool.execute(args);

      console.log(`VirtualCharacterMCPServer: 工具 ${name} 执行完成`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error(`VirtualCharacterMCPServer: 工具调用失败 ${name}:`, error);

      return {
        content: [
          {
            type: 'text',
            text: `工具执行失败: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * 处理资源读取
   */
  async handleResourceRead(uri: string): Promise<any> {
    try {
      console.log(`VirtualCharacterMCPServer: 读取资源 ${uri}`);

      switch (uri) {
        case 'virtual-character://status':
          return this.getCharacterStatus();

        case 'virtual-character://capabilities':
          return this.getCapabilities();

        default:
          throw new Error(`未知资源: ${uri}`);
      }
    } catch (error) {
      console.error(`VirtualCharacterMCPServer: 资源读取失败 ${uri}:`, error);
      throw error;
    }
  }

  /**
   * 获取3D虚拟人物状态
   */
  private getCharacterStatus(): any {
    return {
      timestamp: Date.now(),
      isInitialized: this.isInitialized,
      availableTools: Array.from(this.tools.keys()),
      securityStatus: this.securityManager.getStatus(),
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        mcpVersion: '1.0.0'
      }
    };
  }

  /**
   * 获取功能清单
   */
  private getCapabilities(): any {
    return {
      name: 'conversation-notification',
      version: '1.0.0',
      description: '对话通知工具，支持在Cursor IDE中显示对话消息通知',
      capabilities: {
        conversationNotification: {
          types: ['消息通知', '状态提示', '系统消息'],
          features: ['实时通知', '消息持久化', '状态同步']
        }
      },
      supportedPlatforms: ['win32', 'darwin'],
      requirements: {
        nodejs: '>=16.0.0',
        electron: '>=20.0.0'
      }
    };
  }

  /**
   * 检查服务器是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      console.log('VirtualCharacterMCPServer: 开始清理资源...');

      // 清理工具
      for (const [name, tool] of this.tools) {
        try {
          if ('cleanup' in tool && typeof tool.cleanup === 'function') {
            await tool.cleanup();
          }
        } catch (error) {
          console.error(`清理工具 ${name} 失败:`, error);
        }
      }

      this.tools.clear();

      // 清理安全管理器
      await this.securityManager.cleanup();

      this.isInitialized = false;
      console.log('VirtualCharacterMCPServer: 资源清理完成');
    } catch (error) {
      console.error('VirtualCharacterMCPServer: 清理资源失败:', error);
    }
  }
}