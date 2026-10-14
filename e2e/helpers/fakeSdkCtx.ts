/**
 * E2E FakeSdkCtx —— headless 冒烟测试专用的 SdkContext 内存实现。
 *
 * 与 ai-sdk / ai-runtime tests/ 里的 fake 保持接口一致：
 * - `provide` / `inject`：内存 Map，按 ServiceKey.key（Symbol）定位；
 * - `on` / `emit`：内部维护 handler set；`triggerEvent(evt, payload)` 同步串行触发；
 * - `emitted` 记录所有 `emit(...)`，便于断言 插件事件被派发。
 *
 * 之所以在 e2e/ 下再落一份：跨包 import 其他包的 `tests/` 会污染包语义边界，
 * e2e 属于仓库根级别的顶层测试目录，独立持有自己的 helpers。
 */

import type { SdkContext } from '@nomi-ai/ai-sdk';
import type { PluginEvent, HookContext, HookHandler, ServiceKey } from '@nomi-ai/bundle-ig-base';

export interface FakeSdkCtx extends SdkContext {
  provide<T>(key: ServiceKey<T>, impl: T): void;
  emitted: Array<{ evt: PluginEvent; payload: unknown }>;
  triggerEvent<TPayload>(evt: PluginEvent, payload: TPayload): Promise<void>;
  disposeAll(): void;
}

interface HandlerEntry {
  handler: HookHandler<unknown, unknown>;
}

export function createFakeSdkCtx(): FakeSdkCtx {
  const services = new Map<symbol, unknown>();
  const handlers = new Map<PluginEvent, Set<HandlerEntry>>();
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
      event: PluginEvent,
      handler: HookHandler<TPayload, TResult>,
    ) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      const entry: HandlerEntry = { handler: handler as HookHandler<unknown, unknown> };
      handlers.get(event)!.add(entry);
      return () => {
        handlers.get(event)?.delete(entry);
      };
    },
    emit<TPayload = unknown>(event: PluginEvent, payload: TPayload) {
      emitted.push({ evt: event, payload });
    },
    async triggerEvent<TPayload>(event: PluginEvent, payload: TPayload) {
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
