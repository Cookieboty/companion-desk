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
  /** 官方 API 文档（核对 base URL / 协议 / 模型的依据） */
  docsUrl?: string;
  /** 官方文档是否写明支持 GET {base}/models：true 支持 / false 不支持 / null 文档未写明 */
  modelsEndpoint?: boolean | null;
  /** 已按官方文档核对（核对日期见 docs/PROVIDERS.md） */
  verified: boolean;
  /** 品牌图标 id（packages/ui 的 BrandIcon，来源 @lobehub/icons-static-svg，MIT） */
  icon?: string;
}

/** 预设核对日期（docs/PROVIDERS.md 同步） */
export const PRESETS_CHECKED_AT = '2026-10-11';

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
    verified: true,
  }),
  // ---------------------------------------------------------------- 模型厂商
  P({
    id: 'openai',
    name: 'OpenAI',
    category: 'vendor',
    protocol: 'openai-responses',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6-astra',
    models: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.openai.com',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/models',
    modelsEndpoint: true,
    verified: true,
    icon: 'openai',
    keywords: ['gpt', 'chatgpt'],
  }),
  P({
    id: 'anthropic',
    name: 'Anthropic',
    category: 'vendor',
    protocol: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5'],
    requiresApiKey: true,
    websiteUrl: 'https://console.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
    modelsEndpoint: true,
    verified: true,
    icon: 'anthropic',
    keywords: ['claude'],
  }),
  P({
    id: 'gemini',
    name: 'Google Gemini',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    models: ['gemini-3.8-flash'],
    requiresApiKey: true,
    websiteUrl: 'https://aistudio.google.com',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    modelsEndpoint: true,
    verified: true,
    icon: 'gemini',
    keywords: ['google', '谷歌'],
    hint: 'aistudio.google.com · OpenAI 兼容端点',
  }),
  P({
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-pro',
    models: ['deepseek-v4-pro', 'deepseek-flash'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    modelsEndpoint: true,
    verified: true,
    icon: 'deepseek',
    keywords: ['深度求索'],
  }),
  P({
    id: 'kimi',
    name: 'Kimi',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3',
    models: ['kimi-k3', 'kimi-k2.7-code-highspeed', 'kimi-k2.6'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.moonshot.cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    docsUrl: 'https://platform.moonshot.cn/docs/guide/start-using-kimi-api',
    modelsEndpoint: true,
    verified: true,
    icon: 'kimi',
    keywords: ['moonshot', '月之暗面'],
  }),
  P({
    id: 'zhipu',
    name: 'Zhipu GLM',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.3-flash'],
    requiresApiKey: true,
    websiteUrl: 'https://open.bigmodel.cn',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    modelsEndpoint: null,
    verified: true,
    icon: 'zhipu',
    keywords: ['智谱', 'glm', 'bigmodel'],
  }),
  P({
    id: 'qwen',
    name: '通义千问 百炼',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.8-max',
    models: ['qwen3.8-max'],
    requiresApiKey: true,
    websiteUrl: 'https://bailian.console.aliyun.com',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
    modelsEndpoint: null,
    verified: true,
    icon: 'qwen',
    keywords: ['qwen', '阿里', '百炼', 'aliyun', 'dashscope'],
    hint: '请把 {WorkspaceId} 换成你的业务空间 ID',
  }),
  P({
    id: 'doubao',
    name: '火山方舟 豆包',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-2-1-pro-260628',
    models: ['doubao-seed-2-1-pro-260628', 'doubao-seed-2-0-lite-260428'],
    requiresApiKey: true,
    websiteUrl: 'https://console.volcengine.com/ark',
    docsUrl: 'https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=zh',
    modelsEndpoint: null,
    verified: true,
    icon: 'doubao',
    keywords: ['doubao', 'volcengine', 'ark', '字节'],
  }),
  P({
    id: 'minimax',
    name: 'MiniMax',
    category: 'vendor',
    protocol: 'openai-chat',
    baseURL: 'https://api.minimax.cn/v1',
    defaultModel: 'MiniMax-M3',
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    requiresApiKey: true,
    websiteUrl: 'https://platform.minimaxi.com',
    docsUrl: 'https://platform.minimaxi.com/docs/api-reference/text-openai-api',
    modelsEndpoint: null,
    verified: true,
    icon: 'minimax',
  }),
  P({
    id: 'xai',
    name: 'xAI Grok',
    category: 'vendor',
    protocol: 'openai-responses',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.7',
    models: ['grok-4.7', 'grok-4.3'],
    requiresApiKey: true,
    websiteUrl: 'https://console.x.ai',
    docsUrl: 'https://docs.x.ai/docs/models',
    modelsEndpoint: null,
    verified: true,
    icon: 'xai',
    keywords: ['grok'],
  }),
  // ---------------------------------------------------------------- 第三方平台
  P({
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    models: [],
    requiresApiKey: true,
    websiteUrl: 'https://openrouter.ai',
    apiKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs/api/api-reference/models/get-models',
    modelsEndpoint: true,
    verified: true,
    icon: 'openrouter',
    hint: 'openrouter.ai · 用「获取模型」选择',
  }),
  P({
    id: 'siliconflow',
    name: 'SiliconFlow 硅基流动',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3.2',
    models: ['deepseek-ai/DeepSeek-V3.2', 'Qwen/Qwen3.6-27B'],
    requiresApiKey: true,
    websiteUrl: 'https://siliconflow.cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    docsUrl: 'https://docs.siliconflow.cn/cn/userguide/capabilities/text-generation',
    modelsEndpoint: true,
    verified: true,
    icon: 'siliconcloud',
    keywords: ['硅基'],
  }),
  P({
    id: 'ollama',
    name: 'Ollama（本地）',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: '',
    models: [],
    requiresApiKey: false,
    websiteUrl: 'https://ollama.com',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    modelsEndpoint: true,
    verified: true,
    icon: 'ollama',
    keywords: ['local', '本地'],
    hint: '本地服务 · 用「获取模型」列出已下载的模型',
  }),
  P({
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    category: 'platform',
    protocol: 'openai-chat',
    baseURL: 'http://localhost:1234/v1',
    defaultModel: '',
    models: [],
    requiresApiKey: false,
    websiteUrl: 'https://lmstudio.ai',
    docsUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
    modelsEndpoint: true,
    verified: true,
    icon: 'lmstudio',
    keywords: ['local', '本地'],
    hint: '本地服务 · 用「获取模型」列出已加载的模型',
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
