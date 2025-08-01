#!/usr/bin/env node

/**
 * 独立的MCP服务器
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
    description: '在Cursor IDE对话完成时播放语音提示和显示通知',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '完成消息内容',
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
      },
      required: [],
    },
  },
  {
    name: 'virtual_character_action',
    description: '控制3D虚拟角色执行动作和表情',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['wave', 'celebrate', 'think', 'happy', 'sad', 'excited'],
          description: '角色动作',
        },
        expression: {
          type: 'string',
          enum: ['smile', 'wink', 'surprised', 'neutral'],
          description: '角色表情',
        },
        message: {
          type: 'string',
          description: '要显示的消息',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'code_explanation',
    description: '解释代码并通过虚拟角色展示',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要解释的代码',
        },
        language: {
          type: 'string',
          description: '编程语言',
          default: 'javascript',
        },
        complexity: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: '解释复杂度',
          default: 'intermediate',
        },
      },
      required: ['code'],
    },
  },
];

// 定义prompts
const prompts = [
  {
    name: 'task_complete',
    description: '任务完成时的标准提示模板',
    arguments: [
      {
        name: 'task_name',
        description: '完成的任务名称',
        required: true,
      },
      {
        name: 'result_summary',
        description: '结果摘要',
        required: false,
      },
    ],
  },
  {
    name: 'coding_assistance',
    description: '编程辅助的对话模板',
    arguments: [
      {
        name: 'programming_language',
        description: '编程语言',
        required: true,
      },
      {
        name: 'difficulty_level',
        description: '难度级别',
        required: false,
      },
    ],
  },
];

// 定义资源
const resources = [
  {
    uri: 'virtual-character://status',
    name: '虚拟角色状态',
    description: '获取3D虚拟角色当前状态',
    mimeType: 'application/json',
  },
  {
    uri: 'virtual-character://capabilities',
    name: '功能清单',
    description: '虚拟角色的完整功能列表',
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
    let actionPerformed = false;

    switch (name) {
      case 'conversation_complete':
        const message = args?.message || '对话已完成';
        const type = args?.type || 'all';
        const urgency = args?.urgency || 'normal';

        // 这里可以通过IPC与主程序通信
        result = `✅ 任务完成通知已发送\n消息: ${message}\n类型: ${type}\n级别: ${urgency}`;
        actionPerformed = true;

        // 可以在这里添加语音播放逻辑
        console.log(`播放完成提示: ${message}`);
        break;

      case 'virtual_character_action':
        const action = args?.action || 'wave';
        const expression = args?.expression || 'smile';
        const actionMessage = args?.message || '';

        result = `🎭 虚拟角色执行动作\n动作: ${action}\n表情: ${expression}\n消息: ${actionMessage}`;
        actionPerformed = true;
        break;

      case 'code_explanation':
        const code = (args?.code as string) || '';
        const language = args?.language || 'javascript';
        const complexity = args?.complexity || 'intermediate';

        result = `📚 代码解释模式已启动\n语言: ${language}\n复杂度: ${complexity}\n代码长度: ${code.length} 字符`;
        actionPerformed = true;
        break;

      default:
        throw new Error(`未知工具: ${name}`);
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
    case 'task_complete':
      const taskName = args?.task_name || '未知任务';
      const resultSummary = args?.result_summary || '任务成功完成';

      return {
        description: '任务完成提示',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `任务"${taskName}"已完成。${resultSummary}`,
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `🎉 太棒了！任务"${taskName}"已成功完成！\n\n结果摘要：${resultSummary}\n\n现在我可以为您播放完成提示音，或者帮您处理下一个任务。您希望我做什么？`,
            },
          },
        ],
      };

    case 'coding_assistance':
      const language = args?.programming_language || 'JavaScript';
      const difficulty = args?.difficulty_level || 'intermediate';

      return {
        description: '编程辅助对话',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `我需要${language}编程方面的帮助，难度级别是${difficulty}。`,
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `👨‍💻 太好了！我很乐意帮助您进行${language}编程。\n\n根据您选择的${difficulty}难度级别，我会：\n- 提供清晰的代码解释\n- 演示最佳实践\n- 通过3D虚拟角色形象化展示概念\n\n请告诉我您具体想要了解什么，或者分享您的代码让我来解析！`,
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
              mode: '3d',
              tools_available: tools.length,
              prompts_available: prompts.length,
              last_action: new Date().toISOString(),
              capabilities: [
                'voice_notifications',
                'visual_actions',
                'code_explanation',
                'task_completion'
              ]
            }, null, 2),
          },
        ],
      };

    case 'virtual-character://capabilities':
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tools: tools.map(t => ({ name: t.name, description: t.description })),
              prompts: prompts.map(p => ({ name: p.name, description: p.description })),
              features: [
                '3D虚拟角色控制',
                '语音提示播放',
                '任务完成通知',
                '代码解释辅助',
                'Cursor IDE集成'
              ]
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