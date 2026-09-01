/**
 * EventBroadcaster —— 把 `AIClient.on(evt)` 桥接到所有渲染窗口的 `ai:event` 通道。
 *
 * 对齐 P6 计划 §P6-4：
 * - `start(client)` 一次性订阅全部 12 个业务事件，避免动态 hook 遗漏；
 * - 每次 fire 都广播给 `adapter.getAllWebContents()` 里存活的 web contents；
 * - 支持"按窗口订阅子集"：渲染层通过 `ai:event:subscribe` 通道传入过滤器
 *   （`{ include?: Evt[]; exclude?: Evt[] }`），本类维护 subscribers map。
 *
 * 事件形态：`ai:event` 的 payload 是 `{ evt: AIClientEvent, data: unknown }`。
 */

import type { AIClient } from '@ig-live/ai-sdk';
import type { AIClientEvent, AIClientEventMap } from '@ig-live/ai-sdk';

import type { IpcAdapter, IpcInvokeEvent } from './IpcAdapter';
import type { RuntimeLogger } from './logger';
import { ConsoleRuntimeLogger } from './logger';

const ALL_EVENTS: AIClientEvent[] = [
  'message:delta',
  'message:complete',
  'agent:step',
  'agent:turn-end',
  'agent:stopped-by-user',
  'tool:confirm-required',
  'tool:executed',
  'tts:chunk',
  'tts:end',
  'userProfile:changed',
  'live2d:touch',
  'live2d:motion-end',
];

export const EVENT_BROADCAST_CHANNEL = 'ai:event';
export const EVENT_SUBSCRIBE_CHANNEL = 'ai:event:subscribe';
export const EVENT_UNSUBSCRIBE_CHANNEL = 'ai:event:unsubscribe';

export interface EventFilter {
  include?: AIClientEvent[];
  exclude?: AIClientEvent[];
}

export interface EventBroadcasterOptions {
  adapter: IpcAdapter;
  logger?: RuntimeLogger;
}

export class EventBroadcaster {
  private disposers: Array<() => void> = [];
  private started = false;
  private readonly logger: RuntimeLogger;
  private readonly filters = new Map<number, EventFilter>();
  private readonly subscribeListener = (event: IpcInvokeEvent, ...args: unknown[]) =>
    this.onSubscribe(event, args[0] as EventFilter | undefined);
  private readonly unsubscribeListener = (event: IpcInvokeEvent) =>
    this.filters.delete(event.senderId);

  constructor(private readonly opts: EventBroadcasterOptions) {
    this.logger = opts.logger ?? ConsoleRuntimeLogger;
  }

  start(client: AIClient): void {
    if (this.started) return;
    this.started = true;

    for (const evt of ALL_EVENTS) {
      const off = client.on(evt, (data) => this.broadcast(evt, data));
      this.disposers.push(off);
    }

    this.opts.adapter.on(EVENT_SUBSCRIBE_CHANNEL, this.subscribeListener);
    this.opts.adapter.on(EVENT_UNSUBSCRIBE_CHANNEL, this.unsubscribeListener);
    this.logger.info(`event broadcaster ready · ${ALL_EVENTS.length} events`);
  }

  stop(): void {
    if (!this.started) return;
    for (const off of this.disposers.splice(0)) {
      try {
        off();
      } catch (err) {
        this.logger.warn('event disposer threw', err);
      }
    }
    this.opts.adapter.off(EVENT_SUBSCRIBE_CHANNEL, this.subscribeListener);
    this.opts.adapter.off(EVENT_UNSUBSCRIBE_CHANNEL, this.unsubscribeListener);
    this.filters.clear();
    this.started = false;
  }

  private broadcast<E extends AIClientEvent>(evt: E, data: AIClientEventMap[E]): void {
    const payload = { evt, data };
    const wcs = this.opts.adapter.getAllWebContents();
    for (const wc of wcs) {
      if (wc.isDestroyed()) continue;
      const filter = this.filters.get(wc.id);
      if (filter && !passesFilter(evt, filter)) continue;
      try {
        wc.send(EVENT_BROADCAST_CHANNEL, payload);
      } catch (err) {
        this.logger.warn(`send to wc#${wc.id} threw`, err);
      }
    }
  }

  private onSubscribe(event: IpcInvokeEvent, filter?: EventFilter): void {
    if (!filter) {
      this.filters.delete(event.senderId);
      return;
    }
    this.filters.set(event.senderId, {
      include: filter.include ? [...filter.include] : undefined,
      exclude: filter.exclude ? [...filter.exclude] : undefined,
    });
  }
}

function passesFilter(evt: AIClientEvent, f: EventFilter): boolean {
  if (f.exclude?.includes(evt)) return false;
  if (f.include && !f.include.includes(evt)) return false;
  return true;
}
