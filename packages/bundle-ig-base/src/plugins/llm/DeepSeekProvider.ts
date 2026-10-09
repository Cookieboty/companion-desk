import { BaseOpenAICompat, type OpenAICompatOptions } from './BaseOpenAICompat';

export interface DeepSeekProviderOptions extends Omit<OpenAICompatOptions, 'id' | 'baseURL'> {
  baseURL?: string;
}

export class DeepSeekProvider extends BaseOpenAICompat {
  constructor(opts: DeepSeekProviderOptions = {}) {
    super({
      ...opts,
      id: 'deepseek',
      baseURL: opts.baseURL ?? 'https://api.deepseek.com/v1',
      defaultModel: opts.defaultModel ?? 'deepseek-chat',
      requiresApiKey: opts.requiresApiKey ?? true,
    });
  }
}
