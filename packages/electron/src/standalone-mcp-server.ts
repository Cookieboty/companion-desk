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
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * 执行对话完成通知
 */
async function executeConversationComplete(message: string, type: string, urgency: string): Promise<void> {
  try {
    console.log(`MCP: 执行对话完成通知 - ${message} (${type}, ${urgency})`);

    // 播放系统通知声音
    if (type === 'sound' || type === 'all') {
      await playSystemSound();
    }

    // 使用系统TTS播放语音
    if (type === 'voice' || type === 'all') {
      await playTextToSpeech(message);
    }

    // 显示系统通知
    if (type === 'notification' || type === 'all') {
      await showSystemNotification(message, urgency);
    }

  } catch (error) {
    console.error('MCP: 对话完成通知执行失败:', error);
  }
}

/**
 * 播放系统通知声音
 */
async function playSystemSound(): Promise<void> {
  return new Promise((resolve) => {
    try {
      // macOS 系统通知声音
      if (process.platform === 'darwin') {
        spawn('afplay', ['/System/Library/Sounds/Glass.aiff']);
      }
      // Windows 系统通知声音
      else if (process.platform === 'win32') {
        spawn('powershell', ['-c', '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\notify.wav").PlaySync()']);
      }
      // Linux 使用 aplay 或 paplay
      else {
        spawn('paplay', ['/usr/share/sounds/alsa/Front_Left.wav']).on('error', () => {
          spawn('aplay', ['/usr/share/sounds/alsa/Front_Left.wav']);
        });
      }

      // 短暂延迟后 resolve
      setTimeout(resolve, 500);
    } catch (error) {
      console.error('播放系统声音失败:', error);
      resolve();
    }
  });
}

/**
 * 使用系统TTS播放语音
 */
async function playTextToSpeech(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      // macOS 使用 say 命令
      if (process.platform === 'darwin') {
        spawn('say', ['-v', 'Ting-Ting', text]);
      }
      // Windows 使用 PowerShell
      else if (process.platform === 'win32') {
        const script = `Add-Type -AssemblyName System.speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Speak('${text}')`;
        spawn('powershell', ['-Command', script]);
      }
      // Linux 使用 espeak
      else {
        spawn('espeak', [text]);
      }

      // 给TTS一些时间播放
      setTimeout(resolve, 2000);
    } catch (error) {
      console.error('TTS播放失败:', error);
      resolve();
    }
  });
}

/**
 * 显示系统通知
 */
async function showSystemNotification(message: string, urgency: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const title = '对话完成';

      // macOS
      if (process.platform === 'darwin') {
        spawn('osascript', ['-e', `display notification "${message}" with title "${title}"`]);
      }
      // Windows
      else if (process.platform === 'win32') {
        const script = `New-BurntToastNotification -Text '${title}', '${message}'`;
        spawn('powershell', ['-Command', script]);
      }
      // Linux
      else {
        spawn('notify-send', [title, message]);
      }

      setTimeout(resolve, 100);
    } catch (error) {
      console.error('系统通知失败:', error);
      resolve();
    }
  });
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
        const message = String(args?.message || '对话已完成');
        const type = String(args?.type || 'all');
        const urgency = String(args?.urgency || 'normal');

        // 执行实际的通知功能
        await executeConversationComplete(message, type, urgency);

        result = `✅ 任务完成通知已发送\n消息: ${message}\n类型: ${type}\n级别: ${urgency}`;
        actionPerformed = true;
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