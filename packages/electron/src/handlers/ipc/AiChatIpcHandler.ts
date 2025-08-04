/**
 * AI对话相关IPC处理器
 * 处理AI对话消息、模型管理等相关的IPC通信
 */

import { BaseIpcHandler } from './BaseIpcHandler';
import { ILoggerService } from '../../services/LoggerService';

// AI配置接口
interface AIModel {
  id: string;
  name: string;
  provider: string;
  apiUrl: string;
  model: string;
  enabled: boolean;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
}

interface AIConfig {
  models: AIModel[];
  chatHistory: any[];
  settings: {
    theme: string;
    language: string;
    fontSize: number;
    autoSave: boolean;
    maxHistoryLength: number;
  };
}

export class AiChatIpcHandler extends BaseIpcHandler {
  private aiConfig: AIConfig;

  constructor(logger: ILoggerService) {
    super(logger);
    this.initializeAIConfig();
  }

  /**
   * 初始化AI配置
   */
  private initializeAIConfig(): void {
    this.aiConfig = {
      models: [
        {
          id: 'deepseek',
          name: 'DeepSeek Chat',
          provider: 'deepseek',
          apiUrl: 'https://api.deepseek.com',
          model: 'deepseek-chat',
          enabled: false,
          temperature: 0.7,
          maxTokens: 2048
        },
        {
          id: 'gpt-4',
          name: 'GPT-4',
          provider: 'openai',
          apiUrl: 'https://api.openai.com',
          model: 'gpt-4',
          enabled: false,
          temperature: 0.7,
          maxTokens: 2048
        }
      ],
      chatHistory: [],
      settings: {
        theme: 'light',
        language: 'zh-CN',
        fontSize: 14,
        autoSave: true,
        maxHistoryLength: 1000
      }
    };
  }

  /**
   * 初始化AI对话相关IPC处理器
   */
  initialize(): void {
    // 发送AI对话消息
    this.registerHandler('ai-chat:message:send', async (_, { message, modelId }) => {
      this.validateArgs([message, modelId], 2, ['string', 'string']);

      try {
        this.logger.info('收到AI对话请求', { message, modelId });

        // 检查模型是否配置
        const model = this.aiConfig.models.find(m => m.id === modelId);
        if (!model || !model.enabled || !model.apiKey) {
          throw new Error('模型未配置或API密钥缺失，请先在设置中配置');
        }

        // 模拟AI回复（实际应用中这里会调用真实的AI API）
        await new Promise(resolve => setTimeout(resolve, 1000));
        const response = `这是对"${message}"的模拟回复 (使用模型: ${model.name})`;

        this.logger.info('AI对话回复生成', { modelId, responseLength: response.length });
        return response;

      } catch (error) {
        this.logger.error('AI对话失败', { error: error.message, message, modelId });
        throw error;
      }
    });

    // 流式发送AI对话消息
    this.registerHandler('ai-chat:message:stream', async (event, { message, modelId }) => {
      this.validateArgs([message, modelId], 2, ['string', 'string']);

      try {
        this.logger.info('收到AI流式对话请求', { message, modelId });

        // 检查模型是否配置
        const model = this.aiConfig.models.find(m => m.id === modelId);
        if (!model || !model.enabled || !model.apiKey) {
          event.sender.send('ai-chat:message:chunk', '');
          throw new Error('模型未配置或API密钥缺失，请先在设置中配置');
        }

        // 模拟流式回复
        const chunks = ['这是', '使用', model.name, '的', '流式', '回复', '内容'];
        for (const chunk of chunks) {
          event.sender.send('ai-chat:message:chunk', chunk + ' ');
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        event.sender.send('ai-chat:message:chunk', ''); // 结束标志

        this.logger.info('AI流式对话完成', { modelId, chunkCount: chunks.length });

      } catch (error) {
        this.logger.error('AI流式对话失败', { error: error.message, message, modelId });
        throw error;
      }
    });

    // 获取对话历史
    this.registerHandler('ai-chat:message:getHistory', async () => {
      this.logger.debug('获取对话历史', { count: this.aiConfig.chatHistory.length });
      return this.aiConfig.chatHistory;
    });

    // 清空对话历史
    this.registerHandler('ai-chat:message:clearHistory', async () => {
      const previousCount = this.aiConfig.chatHistory.length;
      this.aiConfig.chatHistory = [];
      this.logger.info('对话历史已清空', { previousCount });
      return this.createSuccessResponse();
    });

    // 保存消息到历史
    this.registerHandler('ai-chat:message:save', async (_, message) => {
      this.validateArgs([message], 1, ['object']);

      try {
        this.aiConfig.chatHistory.push(message);

        // 限制历史长度
        const maxLength = this.aiConfig.settings.maxHistoryLength || 1000;
        if (this.aiConfig.chatHistory.length > maxLength) {
          this.aiConfig.chatHistory = this.aiConfig.chatHistory.slice(-maxLength);
        }

        this.logger.debug('消息已保存到历史', {
          messageId: message.id,
          totalCount: this.aiConfig.chatHistory.length
        });

        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('保存消息到历史失败', { error: error.message, message });
        return this.createErrorResponse(error);
      }
    });

    // 获取AI对话配置
    this.registerHandler('ai-chat:config:get', async () => {
      this.logger.debug('获取AI对话配置', { settings: this.aiConfig.settings });
      return this.aiConfig.settings;
    });

    // 更新AI对话配置
    this.registerHandler('ai-chat:config:update', async (_, config) => {
      this.validateArgs([config], 1, ['object']);

      try {
        this.aiConfig.settings = { ...this.aiConfig.settings, ...config };
        this.logger.info('AI对话配置已更新', { config });
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('更新AI对话配置失败', { error: error.message, config });
        return this.createErrorResponse(error);
      }
    });

    // 获取可用模型列表
    this.registerHandler('ai-chat:model:getAvailable', async () => {
      this.logger.debug('获取可用模型列表', { count: this.aiConfig.models.length });
      return this.aiConfig.models;
    });

    // 添加模型
    this.registerHandler('ai-chat:model:add', async (_, model) => {
      this.validateArgs([model], 1, ['object']);

      try {
        // 检查ID是否已存在
        if (this.aiConfig.models.find(m => m.id === model.id)) {
          throw new Error(`模型ID ${model.id} 已存在`);
        }

        this.aiConfig.models.push(model);
        this.logger.info('模型已添加', { modelId: model.id, modelName: model.name });
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('添加模型失败', { error: error.message, model });
        return this.createErrorResponse(error);
      }
    });

    // 删除模型
    this.registerHandler('ai-chat:model:remove', async (_, modelId) => {
      this.validateArgs([modelId], 1, ['string']);

      try {
        const index = this.aiConfig.models.findIndex(m => m.id === modelId);
        if (index === -1) {
          throw new Error(`模型 ${modelId} 不存在`);
        }

        const removed = this.aiConfig.models.splice(index, 1)[0];
        this.logger.info('模型已删除', { modelId, modelName: removed.name });
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('删除模型失败', { error: error.message, modelId });
        return this.createErrorResponse(error);
      }
    });

    // 更新模型配置
    this.registerHandler('ai-chat:model:update', async (_, modelId, updates) => {
      this.validateArgs([modelId, updates], 2, ['string', 'object']);

      try {
        const model = this.aiConfig.models.find(m => m.id === modelId);
        if (!model) {
          throw new Error(`模型 ${modelId} 不存在`);
        }

        Object.assign(model, updates);
        this.logger.info('模型配置已更新', { modelId, modelName: model.name, updates });
        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('更新模型配置失败', { error: error.message, modelId, updates });
        return this.createErrorResponse(error);
      }
    });

    // 测试模型连接
    this.registerHandler('ai-chat:model:testConnection', async (_, modelId) => {
      this.validateArgs([modelId], 1, ['string']);

      try {
        const model = this.aiConfig.models.find(m => m.id === modelId);
        if (!model) {
          this.logger.warn('测试连接失败，模型不存在', { modelId });
          return false;
        }

        if (!model.enabled || !model.apiKey) {
          this.logger.warn('测试连接失败，模型未配置', { modelId });
          return false;
        }

        // 模拟连接测试
        this.logger.info('测试模型连接', { modelId, modelName: model.name });
        await new Promise(resolve => setTimeout(resolve, 500));

        this.logger.info('模型连接测试成功', { modelId });
        return true;

      } catch (error) {
        this.logger.error('测试模型连接失败', { error: error.message, modelId });
        return false;
      }
    });

    // 获取模型统计信息
    this.registerHandler('ai-chat:model:getStats', async () => {
      const stats = {
        total: this.aiConfig.models.length,
        enabled: this.aiConfig.models.filter(m => m.enabled).length,
        configured: this.aiConfig.models.filter(m => m.apiKey).length,
        providers: [...new Set(this.aiConfig.models.map(m => m.provider))]
      };

      this.logger.debug('获取模型统计信息', { stats });
      return stats;
    });

    // 搜索对话历史
    this.registerHandler('ai-chat:message:search', async (_, query: string) => {
      this.validateArgs([query], 1, ['string']);

      try {
        const results = this.aiConfig.chatHistory.filter(message =>
          message.content && message.content.toLowerCase().includes(query.toLowerCase())
        );

        this.logger.debug('搜索对话历史', { query, resultCount: results.length });
        return results;

      } catch (error) {
        this.logger.error('搜索对话历史失败', { error: error.message, query });
        return [];
      }
    });

    // 导出对话历史
    this.registerHandler('ai-chat:message:export', async () => {
      try {
        const exportData = {
          history: this.aiConfig.chatHistory,
          exportTime: new Date().toISOString(),
          count: this.aiConfig.chatHistory.length
        };

        this.logger.info('对话历史导出', { count: exportData.count });
        return this.createSuccessResponse(exportData);

      } catch (error) {
        this.logger.error('导出对话历史失败', { error: error.message });
        return this.createErrorResponse(error);
      }
    });

    // 导入对话历史
    this.registerHandler('ai-chat:message:import', async (_, importData) => {
      this.validateArgs([importData], 1, ['object']);

      try {
        if (!importData.history || !Array.isArray(importData.history)) {
          throw new Error('导入数据格式错误');
        }

        this.aiConfig.chatHistory = [...this.aiConfig.chatHistory, ...importData.history];

        // 限制历史长度
        const maxLength = this.aiConfig.settings.maxHistoryLength || 1000;
        if (this.aiConfig.chatHistory.length > maxLength) {
          this.aiConfig.chatHistory = this.aiConfig.chatHistory.slice(-maxLength);
        }

        this.logger.info('对话历史导入成功', {
          importCount: importData.history.length,
          totalCount: this.aiConfig.chatHistory.length
        });

        return this.createSuccessResponse();

      } catch (error) {
        this.logger.error('导入对话历史失败', { error: error.message });
        return this.createErrorResponse(error);
      }
    });

    this.logger.info('AiChatIpcHandler 初始化完成', {
      registeredChannels: this.getRegisteredChannels().length,
      modelCount: this.aiConfig.models.length
    });
  }

  /**
   * 获取AI配置（用于调试）
   */
  getAIConfig(): AIConfig {
    return this.aiConfig;
  }
}