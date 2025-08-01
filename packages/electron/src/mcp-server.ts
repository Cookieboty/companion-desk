#!/usr/bin/env node

/**
 * MCP服务器入口文件
 * 启动3D虚拟人物MCP服务器，供Cursor IDE调用
 */

import { VirtualCharacterMCPServer } from './mcp/VirtualCharacterMCPServer.js';
import { CursorIDEIntegration } from './mcp/integration/CursorIDEIntegration.js';

let mcpServer: VirtualCharacterMCPServer | null = null;
let cursorIntegration: CursorIDEIntegration | null = null;

/**
 * 启动MCP服务器
 */
async function startMCPServer(): Promise<void> {
  try {
    console.log('🚀 启动3D虚拟人物MCP服务器...');

    // 创建并初始化MCP服务器
    mcpServer = new VirtualCharacterMCPServer();
    await mcpServer.initialize();

    // 创建并初始化Cursor IDE集成
    cursorIntegration = new CursorIDEIntegration();
    await cursorIntegration.initialize();

    // 设置进程信号处理
    setupSignalHandlers();

    console.log('✅ MCP服务器启动成功');
    console.log('📋 可用工具:', mcpServer.getTools().map(t => t.name).join(', '));
    console.log('📚 可用资源:', mcpServer.getResources().map(r => r.name).join(', '));

    // 输出诊断信息
    if (cursorIntegration) {
      const diagnostics = await cursorIntegration.getDiagnostics();
      console.log('🔍 集成状态:', diagnostics.isRegistered ? '已注册' : '未注册');
    }

    // 保持进程运行
    console.log('⏳ MCP服务器正在运行，等待Cursor IDE连接...');

  } catch (error) {
    console.error('❌ MCP服务器启动失败:', error);
    process.exit(1);
  }
}

/**
 * 停止MCP服务器
 */
async function stopMCPServer(): Promise<void> {
  try {
    console.log('🛑 正在停止MCP服务器...');

    if (mcpServer) {
      await mcpServer.cleanup();
      mcpServer = null;
    }

    if (cursorIntegration) {
      await cursorIntegration.cleanup();
      cursorIntegration = null;
    }

    console.log('✅ MCP服务器已安全停止');
  } catch (error) {
    console.error('❌ 停止MCP服务器时出错:', error);
  }
}

/**
 * 设置进程信号处理器
 */
function setupSignalHandlers(): void {
  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n📨 收到SIGINT信号，正在优雅关闭...');
    await stopMCPServer();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n📨 收到SIGTERM信号，正在优雅关闭...');
    await stopMCPServer();
    process.exit(0);
  });

  // 未处理的异常
  process.on('uncaughtException', async (error) => {
    console.error('💥 未捕获的异常:', error);
    await stopMCPServer();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    console.error('Promise:', promise);
    await stopMCPServer();
    process.exit(1);
  });
}

/**
 * 处理MCP协议消息
 */
async function handleMCPMessage(message: any): Promise<any> {
  try {
    if (!mcpServer || !mcpServer.isReady()) {
      throw new Error('MCP服务器未准备就绪');
    }

    const { method, params } = message;

    switch (method) {
      case 'tools/list':
        return {
          tools: mcpServer.getTools()
        };

      case 'tools/call':
        const { name, arguments: args } = params;
        return await mcpServer.handleToolCall(name, args);

      case 'resources/list':
        return {
          resources: mcpServer.getResources()
        };

      case 'resources/read':
        const { uri } = params;
        return await mcpServer.handleResourceRead(uri);

      default:
        throw new Error(`未知方法: ${method}`);
    }
  } catch (error) {
    console.error('处理MCP消息失败:', error);
    throw error;
  }
}

/**
 * 输出服务器信息
 */
function printServerInfo(): void {
  console.log(`
╭─────────────────────────────────────────────────────────────╮
│                3D虚拟人物MCP服务器                           │
│                                                             │
│  版本: 1.0.0                                                │
│  Node.js: ${process.version}                                     │
│  平台: ${process.platform}                                       │
│  PID: ${process.pid}                                             │
│                                                             │
│  功能:                                                       │
│  • 代码解释和演示                                            │
│  • 3D动画控制                                               │
│  • 智能语音反馈                                              │
│  • 手势引导演示                                              │
│                                                             │
│  集成: Cursor IDE (Model Context Protocol)                  │
╰─────────────────────────────────────────────────────────────╯
  `);
}

// 主函数
async function main(): Promise<void> {
  // 检查命令行参数
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
3D虚拟人物MCP服务器

用法:
  node mcp-server.js [选项]

选项:
  --help, -h          显示帮助信息
  --version, -v       显示版本信息
  --debug             启用调试模式
  --config <path>     指定配置文件路径

环境变量:
  CHARACTER_MODEL_PATH    3D模型文件路径
  VOICE_ENGINE           语音引擎类型 (azure|local|webapi)
  PERFORMANCE_MODE       性能模式 (high|balanced|efficient)
  NODE_ENV              运行环境 (development|production)
    `);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('3D虚拟人物MCP服务器 v1.0.0');
    process.exit(0);
  }

  // 启用调试模式
  if (args.includes('--debug')) {
    process.env.DEBUG = 'true';
    console.log('🐛 调试模式已启用');
  }

  // 输出服务器信息
  printServerInfo();

  // 启动服务器
  await startMCPServer();
}

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
export {
  startMCPServer,
  stopMCPServer,
  handleMCPMessage
};