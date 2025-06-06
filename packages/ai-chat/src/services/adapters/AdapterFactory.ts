import { AIModelConfig } from '../../types/config';
import { BaseAIAdapter } from './BaseAdapter';
import { DeepSeekAdapter } from './DeepSeekAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';

export class AdapterFactory {
  static createAdapter(config: AIModelConfig): BaseAIAdapter {
    switch (config.provider) {
      case 'deepseek':
        return new DeepSeekAdapter(config);
      case 'openai':
        return new OpenAIAdapter(config);
      case 'claude':
        // TODO: 实现Claude适配器
        throw new Error('Claude adapter not implemented yet');
      case 'ollama':
        // TODO: 实现Ollama适配器
        throw new Error('Ollama adapter not implemented yet');
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  static getSupportedProviders(): string[] {
    return ['deepseek', 'openai'];
  }

  static isProviderSupported(provider: string): boolean {
    return this.getSupportedProviders().includes(provider);
  }
} 