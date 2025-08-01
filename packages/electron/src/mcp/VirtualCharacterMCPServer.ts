import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Tool, Resource, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseAdapter } from './tools/BaseAdapter.js';
import { CodeExplanationTool } from './tools/CodeExplanationTool.js';
import { AnimationTool } from './tools/AnimationTool.js';
import { VoiceFeedbackTool } from './tools/VoiceFeedbackTool.js';
import { GestureGuideTool } from './tools/GestureGuideTool.js';
import { ConversationNotificationTool } from './tools/ConversationNotificationTool.js';
import { MCPSecurityManager } from './security/MCPSecurityManager.js';
import { MCPToolRegistry } from './MCPToolRegistry.js';

/**
 * 3D虚拟人物MCP服务器
 * 实现Model Context Protocol，为Cursor IDE提供智能虚拟助手功能
 */
export class VirtualCharacterMCPServer {
  private tools: Map<string, BaseAdapter>;
  private securityManager: MCPSecurityManager;
  private toolRegistry: MCPToolRegistry;
  private isInitialized: boolean = false;

  constructor() {
    this.tools = new Map();
    this.securityManager = new MCPSecurityManager();
    this.toolRegistry = new MCPToolRegistry();
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

      // 创建工具实例
      const codeExplanationTool = new CodeExplanationTool();
      const animationTool = new AnimationTool();
      const voiceFeedbackTool = new VoiceFeedbackTool();
      const gestureGuideTool = new GestureGuideTool();
      const conversationNotificationTool = new ConversationNotificationTool();

      // 注册工具
      this.tools.set('explain_code', codeExplanationTool);
      this.tools.set('show_animation', animationTool);
      this.tools.set('voice_feedback', voiceFeedbackTool);
      this.tools.set('gesture_guide', gestureGuideTool);
      this.tools.set('conversation_notification', conversationNotificationTool);

      // 注册到工具注册中心
      await this.toolRegistry.registerTool('explain_code', codeExplanationTool);
      await this.toolRegistry.registerTool('show_animation', animationTool);
      await this.toolRegistry.registerTool('voice_feedback', voiceFeedbackTool);
      await this.toolRegistry.registerTool('gesture_guide', gestureGuideTool);
      await this.toolRegistry.registerTool('conversation_notification', conversationNotificationTool);

      console.log('VirtualCharacterMCPServer: 工具注册完成，总数:', this.tools.size);
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
      name: 'virtual-character-3d',
      version: '1.0.0',
      description: '3D虚拟人物智能助手，支持代码解释、动画演示、语音反馈和手势引导',
      capabilities: {
        codeExplanation: {
          languages: ['javascript', 'typescript', 'python', 'java', 'cpp', 'csharp'],
          features: ['语法解释', '概念说明', '示例演示', '错误分析']
        },
        animations: {
          types: ['解释动作', '指向动作', '表情动作', '手势动作'],
          features: ['动画混合', '序列播放', '交互响应']
        },
        voiceFeedback: {
          engines: ['azure', 'local', 'webapi'],
          features: ['多语言支持', '情感表达', '实时同步']
        },
        gestureGuide: {
          types: ['编程概念', '操作指导', '注意提示'],
          features: ['3D手势', '录制回放', '自定义库']
        }
      },
      supportedPlatforms: ['win32', 'darwin'],
      requirements: {
        nodejs: '>=16.0.0',
        electron: '>=20.0.0',
        webgl: '2.0'
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