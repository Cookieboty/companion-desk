import { BaseOpenAICompat, type OpenAICompatOptions } from './BaseOpenAICompat';

export interface OpenAIProviderOptions extends Omit<OpenAICompatOptions, 'id' | 'baseURL'> {
  baseURL?: string;
}

export class OpenAIProvider extends BaseOpenAICompat {
  constructor(opts: OpenAIProviderOptions = {}) {
    super({
      id: 'openai',
      baseURL: opts.baseURL ?? 'https://api.openai.com/v1',
      ...opts,
    });
  }
}
