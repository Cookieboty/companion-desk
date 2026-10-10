/**
 * FakeSdkCtx —— 复刻 ai-sdk 里的 fakeSdkCtx 行为，供 ai-runtime 集成测试用。
 *
 * 我们不能跨包 import 其他包的 `tests/`，因此这里维持一份最小实现：
 * - `provide` / `inject`：内存 Map，按 `ServiceKey.key`（Symbol）定位；
 * - `on` / `emit`：内部维护 handler set；`triggerEvent(evt, payload)` 同步串行触发；
 * - `emitted` 保留所有 `emit(...)` 的记录，便于断言 dsh 事件是否被发出。
 */

import type { SdkContext } from '@ig-live/ai-sdk';
import type { DshEvent, HookContext, HookHandler, ServiceKey } from '@ig-live/bundle-ig-base';

export interface FakeSdkCtx extends SdkContext {
  provide<T>(key: ServiceKey<T>, impl: T): void;
  emitted: Array<{ evt: DshEvent; payload: unknown }>;
  triggerEvent<TPayload>(evt: DshEvent, payload: TPayload): Promise<void>;
  disposeAll(): void;
}

interface HandlerEntry {
  handler: HookHandler<unknown, unknown>;
}

export function createFakeSdkCtx(): FakeSdkCtx {
  const services = new Map<symbol, unknown>();
  const handlers = new Map<DshEvent, Set<HandlerEntry>>();
  const emitted: FakeSdkCtx['emitted'] = [];

  const ctx: FakeSdkCtx = {
    emitted,
    provide<T>(key: ServiceKey<T>, impl: T) {
      services.set(key.key, impl);
    },
    inject<T>(key: ServiceKey<T>): T | undefined {
      return services.get(key.key) as T | undefined;
    },
    on<TPayload = unknown, TResult = void>(
      event: DshEvent,
      handler: HookHandler<TPayload, TResult>,
    ) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      const entry: HandlerEntry = { handler: handler as HookHandler<unknown, unknown> };
      handlers.get(event)!.add(entry);
      return () => {
        handlers.get(event)?.delete(entry);
      };
    },
    emit<TPayload = unknown>(event: DshEvent, payload: TPayload) {
      emitted.push({ evt: event, payload });
    },
    async triggerEvent<TPayload>(event: DshEvent, payload: TPayload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const { handler } of set) {
        const hookCtx: HookContext<TPayload> = {
          payload,
          reject: (reason, code) => {
            throw Object.assign(new Error(reason), { code });
          },
          log: () => {},
        };
        await handler(hookCtx as unknown as HookContext<unknown>);
      }
    },
    disposeAll() {
      handlers.clear();
    },
  };

  return ctx;
}
