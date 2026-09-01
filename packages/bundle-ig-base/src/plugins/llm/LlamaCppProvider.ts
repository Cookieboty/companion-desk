import { BaseOpenAICompat, type OpenAICompatOptions } from './BaseOpenAICompat';

export interface LlamaCppProviderOptions extends Omit<OpenAICompatOptions, 'id' | 'baseURL'> {
  baseURL?: string;
}

/**
 * llama.cpp 的 server 模式，OpenAI 兼容路径。
 */
export class LlamaCppProvider extends BaseOpenAICompat {
  constructor(opts: LlamaCppProviderOptions = {}) {
    super({
      id: 'llamacpp',
      baseURL: opts.baseURL ?? 'http://127.0.0.1:8080/v1',
      ...opts,
    });
  }
}
