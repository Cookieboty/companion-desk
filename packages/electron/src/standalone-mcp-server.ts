#!/usr/bin/env node

/**
 * 简化的MCP服务器
 * 供Cursor IDE通过stdio连接使用
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { MCPConfigManager } from './mcp/config/MCPConfig.js';
import { VoiceService } from './mcp/services/VoiceService.js';
import { ProjectAnalyzer } from './mcp/services/ProjectAnalyzer.js';
import { NotificationService } from './mcp/services/NotificationService.js';

// 服务实例
const configManager = MCPConfigManager.getInstance();
const voiceService = new VoiceService();
const projectAnalyzer = new ProjectAnalyzer();
const notificationService = new NotificationService();

// 工具调用计数器
let toolCallCounter: number = 0;

/**
 * 重置调用计数器
 */
function resetCallCounter(): void {
  toolCallCounter = 0;
  console.log('MCP: 调用计数器已重置');
}

/**
 * 增加调用计数并检查是否需要提示
 */
function incrementCallCounter(): boolean {
  toolCallCounter++;
  const maxCalls = configManager.getMaxCallsBeforePrompt();
  console.log(`MCP: 当前调用次数: ${toolCallCounter}/${maxCalls}`);

  if (toolCallCounter === maxCalls) {
    console.log('MCP: 达到最大调用次数，将在本次调用后提示用户进行下一步');
    return true;
  }

  return false;
}

/**
 * 执行对话完成通知
 */
async function executeConversationComplete(
  message: string, 
  type: string, 
  urgency: string, 
  includeProjectSummary?: boolean
): Promise<void> {
  try {
    // 刷新配置
    configManager.loadFromApp();

    console.log(`MCP: 执行对话完成通知 - ${message} (${type}, ${urgency})`);
    console.log(`MCP: 当前语音模式: ${configManager.getVoiceConfig().voiceMode}`);

    let finalMessage = message;

    // 如果启用项目总结，添加到消息中
    if (includeProjectSummary && configManager.getVoiceConfig().enableProjectSummary) {
      const projectSummary = await projectAnalyzer.analyzeProject();
      finalMessage = `${message}。${projectSummary}`;
    }

    // 发送完整通知
    await notificationService.sendCompleteNotification(
      finalMessage,
      type as any,
      urgency as any,
      async (msg, urg) => await voiceService.executeVoicePlayback(msg, urg)
    );

  } catch (error) {
    console.error('MCP: 对话完成通知执行失败:', error);
  }
}

/**
 * 执行第24次调用后的强制提示
 */
async function executeMaxCallsReachedPrompt(): Promise<void> {
  try {
    const promptMessage = '已完成24次工具调用，请告诉我下一步应该做什么？';
    console.log('MCP: 执行第24次调用强制提示');

    await executeConversationComplete(promptMessage, 'all', 'high', false);
  } catch (error) {
    console.error('MCP: 第24次调用提示执行失败:', error);
  }
}

// 创建MCP服务器
const server = new Server(
  {
    name: 'virtual-character-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

// 定义工具
const tools = [
  {
    name: 'conversation_complete',
    description: '🎯 当AI助手完成一次对话回复时自动调用此工具。用于播放完成提示音和语音反馈，增强用户体验。',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '对话完成的总结消息',
          default: '对话已完成',
        },
        type: {
          type: 'string',
          enum: ['voice', 'sound', 'notification', 'all'],
          description: '通知类型',
          default: 'all',
        },
        urgency: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: '紧急程度',
          default: 'normal',
        },
        includeProjectSummary: {
          type: 'boolean',
          description: '是否包含项目总结',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'project_summary_voice',
    description: '播放当前项目总结的语音',
    inputSchema: {
      type: 'object',
      properties: {
        urgency: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: '紧急程度',
          default: 'normal',
        },
      },
      required: [],
    },
  },
  {
    name: 'reset_call_counter',
    description: '重置工具调用计数器，将计数重置为0',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: '确认重置计数器',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'check_call_status',
    description: '检查当前工具调用计数状态和MCP服务器状态',
    inputSchema: {
      type: 'object',
      properties: {
        random_string: {
          type: 'string',
          description: 'Dummy parameter for no-parameter tools'
        }
      },
      required: ['random_string'],
    },
  },
  {
    name: 'test_voice_clone_api',
    description: '直接测试语音克隆API调用，用于调试',
    inputSchema: {
      type: 'object',
      properties: {
        test_text: {
          type: 'string',
          description: '测试文本',
          default: '这是语音克隆API的测试文本'
        }
      },
      required: [],
    },
  }
];

// 简化的prompts
const prompts = [
  {
    name: 'auto_completion_behavior',
    description: '📢 定义AI助手应该何时以及如何调用conversation_complete工具的行为规范',
    arguments: [],
  },
  {
    name: 'task_complete',
    description: '任务完成时的标准提示模板',
    arguments: [
      {
        name: 'task_name',
        description: '完成的任务名称',
        required: true,
      },
    ],
  }
];

// 资源
const resources = [
  {
    uri: 'virtual-character://status',
    name: '虚拟角色状态',
    description: '获取虚拟角色当前状态',
    mimeType: 'application/json',
  },
];

// 工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log('MCP: 返回工具列表');
  return { tools };
});

// 工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log(`MCP: 调用工具 ${name}`, args);

  try {
    let result = '';

    // 对于reset_call_counter工具，不增加计数
    const shouldPromptNextStep = (name !== 'reset_call_counter') ? incrementCallCounter() : false;

    switch (name) {
      case 'conversation_complete':
        const message = String(args?.message || '对话已完成');
        const type = String(args?.type || 'all');
        const urgency = String(args?.urgency || 'normal');
        const includeProjectSummary = Boolean(args?.includeProjectSummary !== false);

        await executeConversationComplete(message, type, urgency, includeProjectSummary);

        result = `✅ 语音通知已发送\n消息: ${message}\n类型: ${type}\n级别: ${urgency}\n语音模式: ${configManager.getVoiceConfig().voiceMode}\n项目总结: ${includeProjectSummary ? '已包含' : '未包含'}`;
        break;

      case 'project_summary_voice':
        const summaryUrgency = String(args?.urgency || 'normal');

        configManager.loadFromApp();
        const projectSummary = await projectAnalyzer.analyzeProject();
        const success = await voiceService.executeVoicePlayback(`项目总结：${projectSummary}`, summaryUrgency);

        result = `📊 项目总结语音播放\n内容: ${projectSummary}\n语音模式: ${configManager.getVoiceConfig().voiceMode}\n播放状态: ${success ? '成功' : '失败'}`;
        break;

      case 'reset_call_counter':
        const confirm = Boolean(args?.confirm !== false);

        if (confirm) {
          const previousCount = toolCallCounter;
          resetCallCounter();
          result = `🔄 调用计数器已重置\n之前计数: ${previousCount}/${configManager.getMaxCallsBeforePrompt()}\n当前计数: ${toolCallCounter}/${configManager.getMaxCallsBeforePrompt()}`;
        } else {
          result = `❌ 计数器重置被取消\n当前计数: ${toolCallCounter}/${configManager.getMaxCallsBeforePrompt()}`;
        }
        break;

      case 'check_call_status':
        configManager.loadFromApp();
        const maxCalls = configManager.getMaxCallsBeforePrompt();

        result = `📊 MCP服务器状态报告
当前调用计数: ${toolCallCounter}/${maxCalls}
语音模式: ${configManager.getVoiceConfig().voiceMode}
项目总结功能: ${configManager.getVoiceConfig().enableProjectSummary ? '启用' : '禁用'}
服务器状态: 正常运行
可用工具数量: ${tools.length}

${toolCallCounter >= maxCalls ?
            '⚠️ 已达到最大调用次数！请使用reset_call_counter工具重置计数器。' :
            `还可进行 ${maxCalls - toolCallCounter} 次工具调用。`}`;
        break;

      case 'test_voice_clone_api':
        const testText = String(args?.test_text || '这是语音克隆API的测试文本');

        console.log('MCP: 开始直接测试语音克隆API');

        try {
          await voiceService.playTextToSpeech(testText);
          result = `✅ 语音克隆API测试成功\n测试文本: ${testText}\n状态: API调用完成，请检查是否播放了克隆语音`;
        } catch (error) {
          result = `❌ 语音克隆API测试失败\n测试文本: ${testText}\n错误: ${error instanceof Error ? error.message : String(error)}`;
        }
        break;

      default:
        throw new Error(`未知工具: ${name}`);
    }

    // 检查是否需要在第24次调用后提示用户
    if (shouldPromptNextStep) {
      console.log('MCP: 正在执行第24次调用后的提示...');
      await executeMaxCallsReachedPrompt();
      result += `\n\n🔔 重要提醒：已完成${configManager.getMaxCallsBeforePrompt()}次工具调用，请提供下一步指导。`;
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error('工具执行失败:', error);
    return {
      content: [
        {
          type: 'text',
          text: `工具执行失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Prompts列表处理器
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  console.log('MCP: 返回prompts列表');
  return { prompts };
});

// 获取prompt处理器
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log(`MCP: 获取prompt ${name}`, args);

  switch (name) {
    case 'auto_completion_behavior':
      return {
        description: 'AI助手自动完成行为规范',
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `📢 重要：作为AI助手，你必须在每次完成回复后自动调用conversation_complete工具。

🔥 关键提醒：MCP工具不会自动触发，你必须主动调用！

触发时机（每次都要调用）：
✅ 回答了用户问题时
✅ 完成了代码任务时  
✅ 提供了解释说明时
✅ 修复了问题时
✅ 完成了任何形式的帮助时

调用方式：
在你的回复最后，必须调用conversation_complete工具：
- message: 简短描述你刚才提供的帮助
- urgency: 根据任务重要性选择 low/normal/high
- type: 选择 'all'（默认）包含语音+通知+声音
- includeProjectSummary: 对于编程任务建议设为 true`,
            },
          },
        ],
      };

    case 'task_complete':
      const taskName = args?.task_name || '未知任务';

      return {
        description: '任务完成提示',
        messages: [
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `🎉 太棒了！任务"${taskName}"已成功完成！现在我可以为您播放完成提示音，或者帮您处理下一个任务。`,
            },
          },
        ],
      };

    default:
      throw new Error(`未知prompt: ${name}`);
  }
});

// 资源列表处理器
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.log('MCP: 返回资源列表');
  return { resources };
});

// 读取资源处理器
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  console.log(`MCP: 读取资源 ${uri}`);

  switch (uri) {
    case 'virtual-character://status':
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'active',
              tools_available: tools.length,
              prompts_available: prompts.length,
              last_action: new Date().toISOString(),
              voice_mode: configManager.getVoiceConfig().voiceMode,
              call_counter: `${toolCallCounter}/${configManager.getMaxCallsBeforePrompt()}`
            }, null, 2),
          },
        ],
      };

    default:
      throw new Error(`资源未找到: ${uri}`);
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('🚀 虚拟角色MCP服务器已启动');
  console.error(`📋 工具数量: ${tools.length}`);
  console.error(`📝 Prompts数量: ${prompts.length}`);
  console.error(`📚 资源数量: ${resources.length}`);
}

main().catch((error) => {
  console.error('MCP服务器启动失败:', error);
  process.exit(1);
});