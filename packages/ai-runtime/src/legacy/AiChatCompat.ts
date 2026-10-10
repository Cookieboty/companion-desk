/**
 * AiChatCompat —— 旧 [`AiChatIpcHandler`](file:///../../../electron/src/handlers/ipc/AiChatIpcHandler.ts)
 * 的**兼容适配层**。
 *
 * 目标：`ai-chat:message:*` / `ai-chat:config:*` / `ai-chat:model:*` 通道行为不变，
 * 内部把请求转发到新 AIClient（chat / sessions / memory）；每次调用打一次 `deprecation`
 * warning + 计数器 +1，方便后续统计和下线。
 *
 * 保留期：2 个次版本；下线时删除本文件与 mapping 文档即可。
 *
 * mapping 表见 [docs/legacy-channel-mapping.md](file:///../../../../docs/legacy-channel-mapping.md)。
 */

import type { AIClient } from '@ig-live/ai-sdk';

import type { IpcAdapter, IpcInvokeEvent } from '../IpcAdapter';
import type { RuntimeLogger } from '../logger';
import { ConsoleRuntimeLogger } from '../logger';

export interface AiChatCompatOptions {
  adapter: IpcAdapter;
  client: AIClient;
  logger?: RuntimeLogger;
  /** 自定义 telemetry 上报；默认走 logger.warn。 */
  onDeprecation?: (channel: string, senderId: number) => void;
}

export const LEGACY_CHANNELS = Object.freeze([
  'ai-chat:message:send',
  'ai-chat:message:stream',
  'ai-chat:message:getHistory',
  'ai-chat:message:clearHistory',
  'ai-chat:config:get',
  'ai-chat:config:update',
  'ai-chat:model:getAvailable',
] as const);

export class AiChatCompat {
  private started = false;
  private readonly logger: RuntimeLogger;
  /** 每条通道的调用计数。可通过 `stats()` 读出。 */
  private readonly counts = new Map<string, number>();

  constructor(private readonly opts: AiChatCompatOptions) {
    this.logger = opts.logger ?? ConsoleRuntimeLogger;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { adapter, client } = this.opts;

    const mark = (ch: string, event: IpcInvokeEvent) => {
      this.counts.set(ch, (this.counts.get(ch) ?? 0) + 1);
      if (this.opts.onDeprecation) this.opts.onDeprecation(ch, event.senderId);
      else this.logger.warn(`[deprecated] ${ch} — 请迁移到 @ig-live/ai-sdk-client`);
    };

    adapter.handle('ai-chat:message:send', async (event, payload) => {
      mark('ai-chat:message:send', event);
      const { message, modelId } = payload as { message: string; modelId?: string };
      return client.chat.sendMessage({
        provider: modelId,
        messages: [{ role: 'user', content: message }],
      });
    });

    adapter.handle('ai-chat:message:stream', async (event, payload) => {
      mark('ai-chat:message:stream', event);
      const { message, modelId, reqId } = payload as {
        message: string;
        modelId?: string;
        reqId?: string;
      };
      const iterable = client.chat.stream({
        reqId,
        provider: modelId,
        messages: [{ role: 'user', content: message }],
      });
      (async () => {
        try {
          for await (const chunk of iterable) {
            const text = (chunk as { type?: string; content?: string }).content ?? '';
            event.send('ai-chat:message:chunk', text);
          }
          event.send('ai-chat:message:chunk', '');
        } catch (err) {
          this.logger.warn('legacy stream threw', err);
          event.send('ai-chat:message:chunk', '');
        }
      })().catch((err) => this.logger.error('legacy stream unhandled', err));
      return { ok: true };
    });

    adapter.handle('ai-chat:message:getHistory', async (event) => {
      mark('ai-chat:message:getHistory', event);
      return client.sessions.list();
    });

    adapter.handle('ai-chat:message:clearHistory', async (event) => {
      mark('ai-chat:message:clearHistory', event);
      for (const s of client.sessions.list()) client.sessions.delete(s.id);
      return { ok: true };
    });

    adapter.handle('ai-chat:config:get', async (event) => {
      mark('ai-chat:config:get', event);
      return { profile: client.memory.userProfile.get() };
    });

    adapter.handle('ai-chat:config:update', async (event, patch) => {
      mark('ai-chat:config:update', event);
      return client.memory.userProfile.set({
        patch: patch as never,
        source: 'user',
      });
    });

    adapter.handle('ai-chat:model:getAvailable', async (event) => {
      mark('ai-chat:model:getAvailable', event);
      // 保留旧结构：{ models: [...] }。因为 P5 阶段 provider 列表在 dsh 内部，返回空数组占位。
      return { models: [] as unknown[] };
    });

    this.logger.info(`legacy compat ready · ${LEGACY_CHANNELS.length} channels bridged`);
  }

  stop(): void {
    if (!this.started) return;
    for (const ch of LEGACY_CHANNELS) {
      try {
        this.opts.adapter.removeHandler(ch);
      } catch (err) {
        this.logger.warn(`removeHandler(${ch}) threw`, err);
      }
    }
    this.started = false;
  }

  stats(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}
