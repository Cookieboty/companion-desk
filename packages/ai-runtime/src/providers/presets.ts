/**
 * Provider 预设 —— 与 cc-switch 一致：预设**只是新建表单的预填模板**
 * （名称 / 官网 / 请求地址 / 上游协议 / 推荐默认模型），没有任何按厂商的代码路径。
 * 保存后的 provider 是独立实体，所有字段都可改。
 */
import type { Protocol } from './protocol';

export type PresetCategory = 'custom' | 'vendor' | 'platform';

export const PRESET_CATEGORY_LABELS: Readonly<Record<PresetCategory, string>> = {
  custom: '自定义配置',
  vendor: '模型厂商',
  platform: '第三方平台',
};

export interface ProviderPreset {
  id: string;
  name: string;
  category: PresetCategory;
  protocol: Protocol;
  baseURL: string;
  defaultModel: string;
  /** 常用模型（仅建议；以「获取模型」拉到的列表为准） */
  models: string[];
  requiresApiKey: boolean;
  websiteUrl?: string;
  apiKeyUrl?: string;
  /** 搜索关键字（中英文别名） */
  keywords?: string[];
  /** 一句话说明（卡片副标题；缺省显示官网域名） */
  hint?: string;
}

const P = (p: ProviderPreset): ProviderPreset => p;

export const PROVIDER_PRESETS: readonly ProviderPreset[] = Object.freeze([
  P({
    id: 'custom',
    name: '自定义配置',
    category: 'custom',
    protocol: 'openai-chat',
    baseURL: '',
    defaultModel: '',
    models: [],
    requiresApiKey: false,
    hint: '手动填写请求地址和 API Key',
  }),
  // ---------------------------------------------------------------- 模型厂商
  P({
    id: 'openai',
    name: 'OpenAI',
    category: 'vendor',
    protocol: 'openai-responses',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'o4-mini'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.openai.com',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    keywords: ['gpt', 'chatgpt'],
  }),
  P({
    id: 'anthropic',
    name: 'Anthropic',
    category: 'vendor',
    protocol: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
    requiresApiKey: true,
    websiteUrl: 'https://console.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    keywords: ['claude'],
  }),
  P({
    id: 'gemini',
    name: 'Google Gemini',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
    requiresApiKey: true,
    websiteUrl: 'https://aistudio.google.com',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    keywords: ['google', '谷歌'],
    hint: 'aistudio.google.com · OpenAI 兼容端点',
  }),
  P({
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    keywords: ['深度求索'],
  }),
  P({
    id: 'kimi',
    name: 'Kimi',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2-0905-preview',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-8k', 'moonshot-v1-32k'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.moonshot.cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    keywords: ['moonshot', '月之暗面'],
  }),
  P({
    id: 'zhipu',
    name: 'Zhipu GLM',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.5',
    models: ['glm-4.5', 'glm-4.5-air', 'glm-4-flash'],
    requiresApiKey: true,
    websiteUrl: 'https://open.bigmodel.cn',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    keywords: ['智谱', 'glm', 'bigmodel'],
  }),
  P({
    id: 'qwen',
    name: '通义千问 DashScope',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    requiresApiKey: true,
    websiteUrl: 'https://bailian.console.aliyun.com',
    keywords: ['qwen', '阿里', '百炼', 'aliyun'],
  }),
  P({
    id: 'doubao',
    name: '火山引擎 豆包',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-1-6-250615',
    models: ['doubao-seed-1-6-250615', 'doubao-1-5-pro-32k-250115'],
    requiresApiKey: true,
    websiteUrl: 'https://console.volcengine.com/ark',
    keywords: ['doubao', 'volcengine', 'ark', '字节'],
  }),
  P({
    id: 'minimax',
    name: 'MiniMax',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M1',
    models: ['MiniMax-M1', 'MiniMax-Text-01'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.minimaxi.com',
  }),
  P({
    id: 'xai',
    name: 'xAI Grok',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-4',
    models: ['grok-4', 'grok-3-mini'],
    requiresApiKey: true,
    websiteUrl: 'https://console.x.ai',
    keywords: ['grok'],
  }),
  // ---------------------------------------------------------------- 第三方平台
  P({
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash'],
    requiresApiKey: true,
    websiteUrl: 'https://openrouter.ai',
    apiKeyUrl: 'https://openrouter.ai/keys',
  }),
  P({
    id: 'siliconflow',
    name: 'SiliconFlow 硅基流动',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-7B-Instruct'],
    requiresApiKey: true,
    websiteUrl: 'https://siliconflow.cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    keywords: ['硅基'],
  }),
  P({
    id: 'ollama',
    name: 'Ollama（本地）',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:3b-instruct',
    models: ['qwen2.5:3b-instruct', 'llama3.2', 'qwen3:4b'],
    requiresApiKey: false,
    websiteUrl: 'https://ollama.com',
    keywords: ['local', '本地'],
  }),
  P({
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'http://127.0.0.1:1234/v1',
    defaultModel: '',
    models: [],
    requiresApiKey: false,
    websiteUrl: 'https://lmstudio.ai',
    keywords: ['local', '本地'],
  }),
]);

export function findPreset(id: string | undefined): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/** 预设搜索：名称 / 官网 / 请求地址 / 关键字，大小写不敏感 */
export function searchPresets(
  q: string,
  list: readonly ProviderPreset[] = PROVIDER_PRESETS,
): ProviderPreset[] {
  const s = q.trim().toLowerCase();
  if (!s) return [...list];
  return list.filter((p) =>
    [p.name, p.websiteUrl, p.baseURL, ...(p.keywords ?? [])]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(s)),
  );
}
