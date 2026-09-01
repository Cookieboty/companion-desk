/**
 * Live2dFacade —— 看板娘操作薄封装。
 *
 * P5 计划 §P5-4 明确：**仅渲染进程 profile 才可用**；否则抛 `LIVE2D_NOT_AVAILABLE`。
 *
 * 依赖只留在类型层：通过 [@ig-live/bundle-ig-live2d/seams](file:///../../bundle-ig-live2d/src/seams/index.ts)
 * 子入口引 `Live2dKey`，避免走 bundle 主入口触发 `assertRendererProcess`。
 */

import {
  Live2dKey,
  type Live2dEvent,
  type Live2dEventPayload,
  type Live2dService,
} from '@ig-live/bundle-ig-live2d/seams';

import type { SdkContext } from '../di/SdkContext';
import { AIClientError, ErrorCodes } from '../errors';

export interface Live2dFacade {
  isAvailable(): boolean;
  playMotion(group: string, index?: number): Promise<void>;
  setExpression(name: string): Promise<void>;
  driveLipSync(rms: number): void;
  setParameter(id: string, value: number): void;
  on<E extends Live2dEvent>(evt: E, fn: (p: Live2dEventPayload<E>) => void): () => void;
}

export function createLive2dFacade(ctx: SdkContext): Live2dFacade {
  const tryGet = (): Live2dService | undefined => ctx.inject(Live2dKey);
  const require = (): Live2dService => {
    const svc = tryGet();
    if (!svc) {
      throw new AIClientError(
        ErrorCodes.LIVE2D_NOT_AVAILABLE,
        'Live2D 仅在渲染进程 profile 且加载 bundle-ig-live2d 后可用',
      );
    }
    return svc;
  };
  return {
    isAvailable: () => Boolean(tryGet()),
    playMotion: async (g, i) => require().playMotion(g, i),
    setExpression: async (n) => require().setExpression(n),
    driveLipSync: (rms) => require().driveLipSync(rms),
    setParameter: (id, v) => require().setParameter(id, v),
    on: (evt, fn) => require().on(evt, fn),
  };
}
