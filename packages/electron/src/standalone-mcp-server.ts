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

// 动态配置 - 从应用设置中读取
let mvpConfig: VoiceConfig = {
  voiceMode: 'fixed', // 默认值，将从应用配置中读取
  enableProjectSummary: true
};

// 工具调用计数器
let toolCallCounter: number = 0;
const MAX_CALLS_BEFORE_PROMPT: number = 24;

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
  console.log(`MCP: 当前调用次数: ${toolCallCounter}/${MAX_CALLS_BEFORE_PROMPT}`);

  if (toolCallCounter === MAX_CALLS_BEFORE_PROMPT) {
    console.log('MCP: 达到最大调用次数，将在本次调用后提示用户进行下一步');
    return true;
  }

  return false;
}

/**
 * 从应用配置中读取语音设置
 * 读取Electron应用的实际运行配置，而不是静态配置文件
 */
function loadVoiceConfigFromApp(): VoiceConfig {
  try {
    // 优先从Electron应用的userData目录读取实际配置
    const os = require('os');

    // 构建Electron应用的userData路径（和main.ts中保持一致）
    const userDataPaths = [
      // 开发环境：使用默认userData路径
      path.join(os.homedir(), 'Library', 'Application Support', 'Electron', 'config.json'),
      // 生产环境：使用应用名称的userData路径  
      path.join(os.homedir(), 'Library', 'Application Support', '智能小助手', 'config.json'),
      // Windows路径
      path.join(os.homedir(), 'AppData', 'Roaming', 'Electron', 'config.json'),
      path.join(os.homedir(), 'AppData', 'Roaming', '智能小助手', 'config.json'),
      // Linux路径
      path.join(os.homedir(), '.config', 'Electron', 'config.json'),
      path.join(os.homedir(), '.config', '智能小助手', 'config.json'),
      // 开发环境fallback
      path.join(process.cwd(), 'config.json'),
      // 静态配置作为最后fallback
      path.join(process.cwd(), 'packages', 'renderer', 'public', 'assets', 'voice', 'config.json'),
      path.join(process.cwd(), '..', '..', 'packages', 'renderer', 'public', 'assets', 'voice', 'config.json')
    ];

    for (const configPath of userDataPaths) {
      if (fs.existsSync(configPath)) {
        console.log(`MCP: 尝试从路径读取配置: ${configPath}`);
        const configData = fs.readFileSync(configPath, 'utf8');
        const appConfig = JSON.parse(configData);

        // 优先读取voiceSettings.voiceMode（应用实际保存的设置）
        if (appConfig.voiceSettings?.voiceMode) {
          mvpConfig.voiceMode = appConfig.voiceSettings.voiceMode;
          mvpConfig.enableProjectSummary = appConfig.voiceSettings.enableProjectSummary !== false;
          console.log(`MCP: 从应用运行配置中读取到语音模式: ${mvpConfig.voiceMode}`);
          console.log(`MCP: 项目总结功能: ${mvpConfig.enableProjectSummary ? '启用' : '禁用'}`);
          break;
        } else if (appConfig.settings?.voiceMode) {
          // 静态配置fallback
          mvpConfig.voiceMode = appConfig.settings.voiceMode;
          mvpConfig.enableProjectSummary = appConfig.settings.enableProjectSummary !== false;
          console.log(`MCP: 从静态配置中读取到语音模式: ${mvpConfig.voiceMode}`);
          console.log(`MCP: 项目总结功能: ${mvpConfig.enableProjectSummary ? '启用' : '禁用'}`);
          break;
        } else if (appConfig.voiceMode) {
          // 直接的voiceMode配置
          mvpConfig.voiceMode = appConfig.voiceMode;
          console.log(`MCP: 从直接配置中读取到语音模式: ${mvpConfig.voiceMode}`);
          break;
        }
      }
    }
  } catch (error) {
    console.warn('MCP: 读取应用配置失败，使用默认语音模式:', error);
  }

  console.log(`MCP: 当前语音配置: ${JSON.stringify(mvpConfig)}`);
  return mvpConfig;
}

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

    // 构建语音文件路径 - 新路径：packages/electron/assets/
    const isDev = process.env.NODE_ENV === 'development';
    let voicePath: string;

    if (isDev) {
      voicePath = path.join(process.cwd(), 'packages', 'electron', 'assets', selectedFile);
    } else {
      voicePath = path.join(process.resourcesPath, 'app', 'assets', selectedFile);
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
 * 执行第24次调用后的强制提示
 */
async function executeMaxCallsReachedPrompt(): Promise<void> {
  try {
    loadVoiceConfigFromApp();

    const promptMessage = '已完成24次工具调用，请告诉我下一步应该做什么？';

    console.log('MCP: 执行第24次调用强制提示');

    // 强制播放语音提示
    await executeVoicePlayback(promptMessage, 'high', false);

    // 显示系统通知
    await showSystemNotification(promptMessage, 'high');

    // 注意：不在这里重置计数器，而是等待用户响应后再重置
    // 这样可以避免无限循环，用户需要主动调用reset_call_counter工具

  } catch (error) {
    console.error('MCP: 第24次调用提示执行失败:', error);
  }
}

/**
 * 执行对话完成通知
 */
async function executeConversationComplete(message: string, type: string, urgency: string, includeProjectSummary?: boolean): Promise<void> {
  try {
    // 先从应用配置中读取最新的语音设置
    loadVoiceConfigFromApp();

    console.log(`MCP: 执行对话完成通知 - ${message} (${type}, ${urgency})`);
    console.log(`MCP: 当前语音模式: ${mvpConfig.voiceMode}`);

    let voicePlaybackSuccess = false;

    // 优先使用MVP语音系统播放语音
    if (type === 'voice' || type === 'all') {
      voicePlaybackSuccess = await executeVoicePlayback(message, urgency, includeProjectSummary || false);

      // 如果语音播放失败且需要兜底声音，使用系统声音
      if (!voicePlaybackSuccess && type === 'all') {
        console.log('MCP: 语音播放失败，使用系统声音作为兜底');
        await playSystemSound();
      }
    }
    // 如果只要求播放系统声音
    else if (type === 'sound') {
      await playSystemSound();
    }

    // 显示系统通知
    if (type === 'notification' || type === 'all') {
      await showSystemNotification(message, urgency);
    }

  } catch (error) {
    console.error('MCP: 对话完成通知执行失败:', error);

    // 最终兜底：如果一切都失败了，至少播放系统声音
    if (type === 'sound' || type === 'voice' || type === 'all') {
      try {
        await playSystemSound();
      } catch (fallbackError) {
        console.error('MCP: 兜底系统声音也播放失败:', fallbackError);
      }
    }
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
      console.log('MCP: 使用系统TTS播放:', text);

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
      console.error('MCP: TTS播放失败:', error);
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
      properties: {},
      required: [],
    },
  }
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
  {
    name: 'call_limit_behavior',
    description: '🔄 指导AI助手在工具调用达到24次时必须播放提示并等待用户指导的行为规范',
    arguments: [
      {
        name: 'notification_urgency',
        description: '提醒紧急程度，默认为high',
        required: false,
      },
      {
        name: 'prompt_message',
        description: '自定义提示消息内容',
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

    // 对于reset_call_counter工具，不增加计数
    const shouldPromptNextStep = (name !== 'reset_call_counter') ? incrementCallCounter() : false;

    switch (name) {
      case 'conversation_complete':
        const message = String(args?.message || '对话已完成');
        const type = String(args?.type || 'all');
        const urgency = String(args?.urgency || 'normal');
        const includeProjectSummary = Boolean(args?.includeProjectSummary !== false);

        // 执行实际的通知功能
        await executeConversationComplete(message, type, urgency, includeProjectSummary);

        result = `✅ MVP语音通知已发送\n消息: ${message}\n类型: ${type}\n级别: ${urgency}\n语音模式: ${mvpConfig.voiceMode} (从应用设置读取)\n项目总结: ${includeProjectSummary ? '已包含' : '未包含'}`;
        actionPerformed = true;
        break;

      case 'project_summary_voice':
        const summaryUrgency = String(args?.urgency || 'normal');

        // 先读取应用配置
        loadVoiceConfigFromApp();

        // 生成项目总结并播放
        const projectSummary = await analyzeProject();
        const success = await executeVoicePlayback(`项目总结：${projectSummary}`, summaryUrgency, false);

        result = `📊 项目总结语音播放\n内容: ${projectSummary}\n语音模式: ${mvpConfig.voiceMode} (从应用设置读取)\n播放状态: ${success ? '成功' : '失败'}`;
        actionPerformed = true;
        break;

      case 'reset_call_counter':
        const confirm = Boolean(args?.confirm !== false);

        if (confirm) {
          const previousCount = toolCallCounter;
          resetCallCounter();
          result = `🔄 调用计数器已重置\n之前计数: ${previousCount}/${MAX_CALLS_BEFORE_PROMPT}\n当前计数: ${toolCallCounter}/${MAX_CALLS_BEFORE_PROMPT}`;
        } else {
          result = `❌ 计数器重置被取消\n当前计数: ${toolCallCounter}/${MAX_CALLS_BEFORE_PROMPT}`;
        }

        actionPerformed = true;
        break;

      case 'check_call_status':
        // 加载最新配置
        loadVoiceConfigFromApp();

        result = `📊 MCP服务器状态报告
当前调用计数: ${toolCallCounter}/${MAX_CALLS_BEFORE_PROMPT}
语音模式: ${mvpConfig.voiceMode}
项目总结功能: ${mvpConfig.enableProjectSummary ? '启用' : '禁用'}
服务器状态: 正常运行
可用工具数量: ${tools.length}

${toolCallCounter >= MAX_CALLS_BEFORE_PROMPT ?
            '⚠️ 已达到最大调用次数！请使用reset_call_counter工具重置计数器。' :
            `还可进行 ${MAX_CALLS_BEFORE_PROMPT - toolCallCounter} 次工具调用。`}`;

        actionPerformed = true;
        break;



      default:
        throw new Error(`未知工具: ${name}`);
    }

    // 检查是否需要在第24次调用后提示用户
    if (shouldPromptNextStep) {
      console.log('MCP: 正在执行第24次调用后的提示...');
      await executeMaxCallsReachedPrompt();
      result += `\n\n🔔 重要提醒：已完成${MAX_CALLS_BEFORE_PROMPT}次工具调用，请提供下一步指导。请使用reset_call_counter工具重置计数器后继续。`;
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
              text: `📢 重要：作为AI助手，你必须在每次完成回复后自动调用conversation_complete工具。

🔥 关键提醒：MCP工具不会自动触发，你必须主动调用！

触发时机（每次都要调用）：
✅ 回答了用户问题时
✅ 完成了代码任务时  
✅ 提供了解释说明时
✅ 修复了问题时
✅ 完成了任何形式的帮助时
✅ 即使是简单的确认或状态更新

调用方式：
在你的回复最后，必须调用conversation_complete工具：
- message: 简短描述你刚才提供的帮助（必需）
- urgency: 根据任务重要性选择 low/normal/high（可选，默认normal）
- type: 选择 'all'（默认）包含语音+通知+声音
- includeProjectSummary: 对于编程任务建议设为 true

⚠️ 重要：如果计数器达到24次，系统会要求你停止并等待用户指导。请使用check_call_status工具检查状态。

示例调用：
conversation_complete({
  "message": "代码问题已解决",
  "urgency": "normal",
  "includeProjectSummary": true
})`,
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