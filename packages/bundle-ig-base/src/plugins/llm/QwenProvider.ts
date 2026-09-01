import { BaseOpenAICompat, type OpenAICompatOptions } from './BaseOpenAICompat';

export interface QwenProviderOptions extends Omit<OpenAICompatOptions, 'id' | 'baseURL'> {
  baseURL?: string;
}

/**
 * 阿里通义千问 DashScope OpenAI 兼容路径。
 */
export class QwenProvider extends BaseOpenAICompat {
  constructor(opts: QwenProviderOptions = {}) {
    super({
      id: 'qwen',
      baseURL: opts.baseURL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      ...opts,
    });
  }
}
