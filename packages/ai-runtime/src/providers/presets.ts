/**
 * Provider 预设（参考 cc-switch 的 preset 模型：名称 + 协议 + 默认端点 + 推荐模型 + 官网）。
 *
 * 预设只是「新建 provider 表单」的模板；保存后的 provider 是独立实体，可随意改 baseURL /
 * 模型 / headers。`backend` 决定走哪个 AI SDK 适配器。
 */
import type { AiSdkBackend } from '../ai-sdk/AiSdkLlmProvider';

export interface ProviderPreset {
  id: string;
  name: string;
  backend: AiSdkBackend;
  baseURL: string;
  defaultModel: string;
  /** 常用模型（UI 下拉建议，非白名单） */
  models: string[];
  requiresApiKey: boolean;
  websiteUrl?: string;
  /** 申请 key 的页面 */
  apiKeyUrl?: string;
  /** 对应的环境变量 key（文档 / 提示用） */
  envKey?: string;
  category: 'official' | 'cn' | 'aggregator' | 'local' | 'custom';
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = Object.freeze([
  {
    id: 'deepseek',
    name: 'DeepSeek',
    backend: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    envKey: 'DEEPSEEK_API_KEY',
    category: 'cn',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    backend: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.openai.com',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    envKey: 'OPENAI_API_KEY',
    category: 'official',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    backend: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
    requiresApiKey: true,
    websiteUrl: 'https://console.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    envKey: 'ANTHROPIC_API_KEY',
    category: 'official',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    backend: 'google',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
    requiresApiKey: true,
    websiteUrl: 'https://aistudio.google.com',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    category: 'official',
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    backend: 'openai-compatible',
    baseURL: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:3b-instruct',
    models: ['qwen2.5:3b-instruct', 'llama3.2', 'qwen3:4b'],
    requiresApiKey: false,
    websiteUrl: 'https://ollama.com',
    envKey: 'OLLAMA_BASE_URL',
    category: 'local',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    backend: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash'],
    requiresApiKey: true,
    websiteUrl: 'https://openrouter.ai',
    apiKeyUrl: 'https://openrouter.ai/keys',
    category: 'aggregator',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow 硅基流动',
    backend: 'openai-compatible',
    baseURL: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3', 'THUDM/glm-4-9b-chat'],
    requiresApiKey: true,
    websiteUrl: 'https://siliconflow.cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    category: 'aggregator',
  },
  {
    id: 'qwen',
    name: '通义千问 DashScope',
    backend: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    requiresApiKey: true,
    websiteUrl: 'https://bailian.console.aliyun.com',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    category: 'cn',
  },
  {
    id: 'moonshot',
    name: 'Moonshot Kimi',
    backend: 'openai-compatible',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-k2-0905-preview'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.moonshot.cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    category: 'cn',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    backend: 'openai-compatible',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4.5'],
    requiresApiKey: true,
    websiteUrl: 'https://open.bigmodel.cn',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    category: 'cn',
  },
  {
    id: 'doubao',
    name: '豆包 火山方舟',
    backend: 'openai-compatible',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-1-5-pro-32k-250115',
    models: ['doubao-1-5-pro-32k-250115', 'doubao-1-5-lite-32k-250115'],
    requiresApiKey: true,
    websiteUrl: 'https://console.volcengine.com/ark',
    apiKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    category: 'cn',
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    backend: 'openai-compatible',
    baseURL: 'http://127.0.0.1:8080/v1',
    defaultModel: 'default',
    models: [],
    requiresApiKey: false,
    category: 'custom',
  },
]);

export function findPreset(id: string | undefined): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
