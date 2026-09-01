import { BaseOpenAICompat, type OpenAICompatOptions } from './BaseOpenAICompat';

export interface DoubaoProviderOptions extends Omit<OpenAICompatOptions, 'id' | 'baseURL'> {
  baseURL?: string;
}

/**
 * 字节豆包 / 火山方舟 OpenAI 兼容路径。
 */
export class DoubaoProvider extends BaseOpenAICompat {
  constructor(opts: DoubaoProviderOptions = {}) {
    super({
      id: 'doubao',
      baseURL: opts.baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3',
      ...opts,
    });
  }
}
