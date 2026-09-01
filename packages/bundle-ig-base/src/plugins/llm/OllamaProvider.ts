import { BaseOpenAICompat, type OpenAICompatOptions } from './BaseOpenAICompat';

export interface OllamaProviderOptions extends Omit<OpenAICompatOptions, 'id' | 'baseURL'> {
  baseURL?: string;
}

/**
 * Ollama 走本地 http://127.0.0.1:11434，OpenAI 兼容路径 /v1/chat/completions。
 */
export class OllamaProvider extends BaseOpenAICompat {
  constructor(opts: OllamaProviderOptions = {}) {
    super({
      id: 'ollama',
      baseURL: opts.baseURL ?? 'http://127.0.0.1:11434/v1',
      ...opts,
    });
  }
}
