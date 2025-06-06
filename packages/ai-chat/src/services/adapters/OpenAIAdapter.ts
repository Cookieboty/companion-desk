import axios from 'axios';
import { BaseAIAdapter, ChatRequest, ChatResponse, StreamChunk } from './BaseAdapter';

export class OpenAIAdapter extends BaseAIAdapter {
  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.validateConfig();

    try {
      const messages = this.buildMessages(request);

      const response = await axios.post(
        `${this.config.apiUrl}/v1/chat/completions`,
        {
          model: this.config.model,
          messages,
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? this.config.maxTokens ?? 2048,
          stream: false
        },
        {
          headers: this.buildHeaders(),
          timeout: 30000
        }
      );

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        usage: response.data.usage ? {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        } : undefined
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async streamChat(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    this.validateConfig();

    try {
      const messages = this.buildMessages(request);

      const response = await axios.post(
        `${this.config.apiUrl}/v1/chat/completions`,
        {
          model: this.config.model,
          messages,
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? this.config.maxTokens ?? 2048,
          stream: true
        },
        {
          headers: this.buildHeaders(),
          responseType: 'stream',
          timeout: 30000
        }
      );

      let buffer = '';

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              onChunk({ content: '', finished: true });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta?.content;

              if (delta) {
                onChunk({ content: delta, finished: false });
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      response.data.on('end', () => {
        onChunk({ content: '', finished: true });
      });

      response.data.on('error', (error: any) => {
        throw this.handleError(error);
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.config.apiUrl}/v1/models`,
        {
          headers: this.buildHeaders(),
          timeout: 10000
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  private buildMessages(request: ChatRequest) {
    const messages = [];

    // 添加历史消息
    if (request.history) {
      for (const msg of request.history) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // 添加当前消息
    messages.push({
      role: 'user',
      content: request.message
    });

    return messages;
  }
} 