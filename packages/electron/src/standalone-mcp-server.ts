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
import * as fs from 'fs';
import { spawn } from 'child_process';

// MVP语音系统配置
interface VoiceConfig {
  voiceMode: 'fixed' | 'tts' | 'mixed';
  enableProjectSummary: boolean;
}

let mvpConfig: VoiceConfig = {
  voiceMode: 'mixed',
  enableProjectSummary: true
};

// 预设语音文件列表
const VOICE_FILES = [
  'completion/normal/completion_01.mp3',
  'completion/normal/completion_02.mp3',
  'completion/excited/great_job_01.mp3',
  'completion/calm/done_01.mp3'
];

/**
 * MVP: 播放固定语音文件
 */
async function playFixedVoice(urgency: string = 'normal'): Promise<boolean> {
  try {
    // 根据urgency选择语音文件
    let selectedFile: string;
    switch (urgency) {
      case 'high':
        selectedFile = 'completion/excited/great_job_01.mp3';
        break;
      case 'low':
        selectedFile = 'completion/calm/done_01.mp3';
        break;
      default:
        // 随机选择normal语音
        const normalFiles = ['completion/normal/completion_01.mp3', 'completion/normal/completion_02.mp3'];
        selectedFile = normalFiles[Math.floor(Math.random() * normalFiles.length)];
    }

    // 构建语音文件路径
    const isDev = process.env.NODE_ENV === 'development';
    let voicePath: string;

    if (isDev) {
      voicePath = path.join(process.cwd(), 'packages', 'renderer', 'public', 'assets', 'voice', selectedFile);
    } else {
      voicePath = path.join(process.resourcesPath, 'renderer', 'assets', 'voice', selectedFile);
    }

    // 检查文件是否存在
    if (!fs.existsSync(voicePath)) {
      console.log(`MCP: 语音文件不存在: ${voicePath}，fallback到TTS`);
      return false;
    }

    console.log(`MCP: 播放固定语音: ${selectedFile}`);

    // 播放音频文件
    if (process.platform === 'darwin') {
      spawn('afplay', [voicePath]);
    } else if (process.platform === 'win32') {
      spawn('powershell', ['-c', `(New-Object Media.SoundPlayer "${voicePath}").PlaySync()`]);
    } else {
      spawn('mpg123', [voicePath]).on('error', () => {
        spawn('ffplay', ['-nodisp', '-autoexit', voicePath]);
      });
    }

    return true;
  } catch (error) {
    console.error('MCP: 固定语音播放失败:', error);
    return false;
  }
}

/**
 * MVP: 简单项目分析
 */
async function analyzeProject(): Promise<string> {
  try {
    const currentDir = process.cwd();
    console.log(`MCP: 分析项目目录: ${currentDir}`);

    // 简单的文件统计
    let fileCount = 0;
    let recentChanges: string[] = [];

    // 检查常见的项目文件
    const projectFiles = [
      'package.json',
      'tsconfig.json',
      'src',
      'packages',
      'README.md'
    ];

    const existingFiles = projectFiles.filter(file => {
      const filePath = path.join(currentDir, file);
      return fs.existsSync(filePath);
    });

    fileCount = existingFiles.length;

    // 简单的项目类型检测
    let projectType = '未知项目';
    if (existingFiles.includes('package.json')) {
      projectType = 'Node.js项目';
    }
    if (existingFiles.includes('packages')) {
      projectType = 'Monorepo项目';
    }

    // 生成简单总结
    const summary = `当前${projectType}，包含${fileCount}个主要文件，项目状态正常`;
    console.log(`MCP: 项目分析结果: ${summary}`);

    return summary;
  } catch (error) {
    console.error('MCP: 项目分析失败:', error);
    return '项目分析失败，但工作继续进行中';
  }
}

/**
 * MVP: 执行语音播放（支持模式切换）
 */
async function executeVoicePlayback(message: string, urgency: string = 'normal', includeProjectSummary: boolean = false): Promise<boolean> {
  try {
    let finalMessage = message;

    // 如果启用项目总结，添加到消息中
    if (includeProjectSummary && mvpConfig.enableProjectSummary) {
      const projectSummary = await analyzeProject();
      finalMessage = `${message}。${projectSummary}`;
    }

    console.log(`MCP: 执行语音播放 - 模式: ${mvpConfig.voiceMode}, 消息: ${finalMessage}`);

    let success = false;

    switch (mvpConfig.voiceMode) {
      case 'fixed':
        success = await playFixedVoice(urgency);
        if (!success) {
          console.log('MCP: 固定语音失败，fallback到TTS');
          await playTextToSpeech(finalMessage);
          success = true;
        }
        break;

      case 'tts':
        await playTextToSpeech(finalMessage);
        success = true;
        break;

      case 'mixed':
      default:
        // 混合模式：短消息用固定语音，长消息或包含项目总结用TTS
        if (finalMessage.length > 20 || includeProjectSummary) {
          await playTextToSpeech(finalMessage);
          success = true;
        } else {
          success = await playFixedVoice(urgency);
          if (!success) {
            await playTextToSpeech(finalMessage);
            success = true;
          }
        }
        break;
    }

    return success;
  } catch (error) {
    console.error('MCP: 语音播放执行失败:', error);
    return false;
  }
}

/**
 * 执行对话完成通知
 */
async function executeConversationComplete(message: string, type: string, urgency: string, voiceMode?: string, includeProjectSummary?: boolean): Promise<void> {
  try {
    console.log(`MCP: 执行对话完成通知 - ${message} (${type}, ${urgency})`);

    // 临时切换语音模式（如果提供）
    const originalMode = mvpConfig.voiceMode;
    if (voiceMode && ['fixed', 'tts', 'mixed'].includes(voiceMode)) {
      mvpConfig.voiceMode = voiceMode as 'fixed' | 'tts' | 'mixed';
    }

    // 播放系统通知声音
    if (type === 'sound' || type === 'all') {
      await playSystemSound();
    }

    // 使用MVP语音系统播放语音
    if (type === 'voice' || type === 'all') {
      const success = await executeVoicePlayback(message, urgency, includeProjectSummary || false);
      if (!success) {
        console.log('MCP: MVP语音播放失败，使用原始TTS');
        await playTextToSpeech(message);
      }
    }

    // 显示系统通知
    if (type === 'notification' || type === 'all') {
      await showSystemNotification(message, urgency);
    }

    // 恢复原始语音模式
    mvpConfig.voiceMode = originalMode;

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
    description: '🎯 当AI助手完成一次对话回复时自动调用此工具。用于播放完成提示音和语音反馈，增强用户体验。应该在每次助手回复结束时触发。',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '对话完成的总结消息，建议包含完成的任务或提供的帮助',
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
        voiceMode: {
          type: 'string',
          enum: ['fixed', 'tts', 'mixed'],
          description: '语音模式：fixed=固定语音文件，tts=文本转语音，mixed=混合模式',
          default: 'mixed',
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
    description: '播放当前项目的语音总结',
    inputSchema: {
      type: 'object',
      properties: {
        voiceMode: {
          type: 'string',
          enum: ['tts', 'mixed'],
          description: '语音模式',
          default: 'tts',
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
];

// 定义prompts
const prompts = [
  {
    name: 'conversation_completion_trigger',
    description: '🤖 指导AI助手在完成回复后自动触发完成通知的系统提示',
    arguments: [
      {
        name: 'conversation_type',
        description: '对话类型：coding, debugging, explanation, general',
        required: false,
      },
      {
        name: 'completion_urgency',
        description: '完成紧急程度：low, normal, high',
        required: false,
      },
    ],
  },
  {
    name: 'auto_completion_behavior',
    description: '📢 定义AI助手应该何时以及如何调用conversation_complete工具的行为规范',
    arguments: [
      {
        name: 'trigger_conditions',
        description: '触发条件：每次完成回复时都应调用',
        required: false,
      },
      {
        name: 'voice_preferences',
        description: '语音偏好设置',
        required: false,
      },
    ],
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
      {
        name: 'result_summary',
        description: '结果摘要',
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
        const voiceMode = String(args?.voiceMode || 'mixed');
        const includeProjectSummary = Boolean(args?.includeProjectSummary !== false);

        // 执行实际的通知功能
        await executeConversationComplete(message, type, urgency, voiceMode, includeProjectSummary);

        result = `✅ MVP语音通知已发送\n消息: ${message}\n类型: ${type}\n级别: ${urgency}\n语音模式: ${voiceMode}\n项目总结: ${includeProjectSummary ? '已包含' : '未包含'}`;
        actionPerformed = true;
        break;

      case 'project_summary_voice':
        const summaryVoiceMode = String(args?.voiceMode || 'tts');
        const summaryUrgency = String(args?.urgency || 'normal');

        // 生成项目总结并播放
        const projectSummary = await analyzeProject();
        const success = await executeVoicePlayback(`项目总结：${projectSummary}`, summaryUrgency, false);

        result = `📊 项目总结语音播放\n内容: ${projectSummary}\n语音模式: ${summaryVoiceMode}\n播放状态: ${success ? '成功' : '失败'}`;
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
    case 'conversation_completion_trigger':
      const conversationType = args?.conversation_type || 'general';
      const urgency = args?.completion_urgency || 'normal';

      return {
        description: '自动触发对话完成通知的系统指导',
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `🤖 系统指导：当你完成一次回复后，应该自动调用conversation_complete工具来播放完成提示音。这能提供更好的用户体验。

对话类型：${conversationType}
建议紧急程度：${urgency}

请在你的回复结束时包含对conversation_complete工具的调用。示例：
- 对于编程帮助：urgency设为"normal"，message设为"代码问题已解决"
- 对于简单问答：urgency设为"low"，message设为"问题已回答"
- 对于重要任务：urgency设为"high"，message设为"重要任务已完成"`,
            },
          },
        ],
      };

    case 'auto_completion_behavior':
      return {
        description: 'AI助手自动完成行为规范',
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `📢 重要：作为AI助手，你应该在每次完成回复后自动调用conversation_complete工具。

触发时机：
✅ 回答了用户问题时
✅ 完成了代码任务时  
✅ 提供了解释说明时
✅ 修复了问题时
✅ 完成了任何形式的帮助时

调用方式：
使用conversation_complete工具，参数如下：
- message: 简短描述你刚才提供的帮助
- urgency: 根据任务重要性选择 low/normal/high
- voiceMode: 推荐使用 "mixed" 模式
- includeProjectSummary: 对于编程任务建议设为 true

这样用户就能听到完成提示音，获得更好的交互体验。`,
            },
          },
        ],
      };

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