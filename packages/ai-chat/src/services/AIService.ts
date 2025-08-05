import { AIModelConfig } from '../types/config';
import { ChatMessage } from '../types/chat';
import { AdapterFactory } from './adapters/AdapterFactory';
import { BaseAIAdapter, ChatRequest } from './adapters/BaseAdapter';

export class AIService {
  private adapters: Map<string, BaseAIAdapter> = new Map();
  private models: AIModelConfig[] = [];

  // 初始化服务
  async initialize(models: AIModelConfig[]) {
    this.models = models;
    this.adapters.clear();

    // 为每个启用的模型创建适配器
    for (const model of models) {
      if (model.enabled && AdapterFactory.isProviderSupported(model.provider)) {
        try {
          const adapter = AdapterFactory.createAdapter(model);
          this.adapters.set(model.id, adapter);
          console.log(`AI Service: 已初始化 ${model.name} 适配器`);
        } catch (error) {
          console.error(`AI Service: 初始化 ${model.name} 适配器失败:`, error);
        }
      }
    }
  }

  // 发送消息
  async sendMessage(
    message: string,
    modelId: string,
    history: ChatMessage[] = []
  ): Promise<string> {
    const adapter = this.adapters.get(modelId);
    if (!adapter) {
      throw new Error(`模型 ${modelId} 不可用或未配置`);
    }

    const request: ChatRequest = {
      message,
      history: this.convertHistory(history),
      temperature: this.getModelConfig(modelId)?.temperature,
      maxTokens: this.getModelConfig(modelId)?.maxTokens
    };

    try {
      const response = await adapter.chat(request);
      return response.content;
    } catch (error) {
      console.error(`AI Service: 发送消息失败 (${modelId}):`, error);
      throw error;
    }
  }

  // 发送流式消息
  async sendStreamMessage(
    message: string,
    modelId: string,
    history: ChatMessage[] = [],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const adapter = this.adapters.get(modelId);
    if (!adapter) {
      throw new Error(`模型 ${modelId} 不可用或未配置`);
    }

    const request: ChatRequest = {
      message,
      history: this.convertHistory(history),
      temperature: this.getModelConfig(modelId)?.temperature,
      maxTokens: this.getModelConfig(modelId)?.maxTokens
    };

    try {
      await adapter.streamChat(request, (chunk) => {
        if (!chunk.finished && chunk.content) {
          onChunk(chunk.content);
        }
      });
    } catch (error) {
      console.error(`AI Service: 发送流式消息失败 (${modelId}):`, error);
      throw error;
    }
  }

  // 测试模型连接
  async testModelConnection(modelId: string): Promise<boolean> {
    const adapter = this.adapters.get(modelId);
    if (!adapter) {
      return false;
    }

    try {
      return await adapter.testConnection();
    } catch (error) {
      console.error(`AI Service: 测试连接失败 (${modelId}):`, error);
      return false;
    }
  }

  // 获取可用模型列表
  getAvailableModels(): AIModelConfig[] {
    return this.models.filter(model =>
      model.enabled && this.adapters.has(model.id)
    );
  }

  // 添加模型
  async addModel(model: AIModelConfig): Promise<void> {
    // 检查模型ID是否已存在
    if (this.models.find(m => m.id === model.id)) {
      throw new Error(`模型ID ${model.id} 已存在`);
    }

    // 验证提供商是否支持
    if (!AdapterFactory.isProviderSupported(model.provider)) {
      throw new Error(`不支持的提供商: ${model.provider}`);
    }

    // 添加到模型列表
    this.models.push(model);

    // 如果模型启用，创建适配器
    if (model.enabled) {
      try {
        const adapter = AdapterFactory.createAdapter(model);
        this.adapters.set(model.id, adapter);
        console.log(`AI Service: 已添加 ${model.name} 模型`);
      } catch (error) {
        console.error(`AI Service: 添加模型失败:`, error);
        throw error;
      }
    }
  }

  // 删除模型
  removeModel(modelId: string): void {
    this.models = this.models.filter(m => m.id !== modelId);
    this.adapters.delete(modelId);
    console.log(`AI Service: 已删除模型 ${modelId}`);
  }

  // 更新模型配置
  async updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void> {
    const modelIndex = this.models.findIndex(m => m.id === modelId);
    if (modelIndex === -1) {
      throw new Error(`模型 ${modelId} 不存在`);
    }

    // 更新模型配置
    this.models[modelIndex] = { ...this.models[modelIndex], ...updates };
    const updatedModel = this.models[modelIndex];

    // 重新创建适配器
    this.adapters.delete(modelId);
    if (updatedModel.enabled && AdapterFactory.isProviderSupported(updatedModel.provider)) {
      try {
        const adapter = AdapterFactory.createAdapter(updatedModel);
        this.adapters.set(modelId, adapter);
        console.log(`AI Service: 已更新 ${updatedModel.name} 模型`);
      } catch (error) {
        console.error(`AI Service: 更新模型失败:`, error);
        throw error;
      }
    }
  }

  // 获取模型配置
  private getModelConfig(modelId: string): AIModelConfig | undefined {
    return this.models.find(m => m.id === modelId);
  }

  // 转换历史消息格式
  private convertHistory(history: ChatMessage[]) {
    return history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
  }

  // 获取服务状态
  getStatus() {
    return {
      totalModels: this.models.length,
      enabledModels: this.models.filter(m => m.enabled).length,
      availableModels: this.adapters.size,
      supportedProviders: AdapterFactory.getSupportedProviders()
    };
  }
} 