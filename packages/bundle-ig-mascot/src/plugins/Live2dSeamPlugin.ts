import { definePlugin, type PluginContext } from '@ig-live/bundle-ig-base';

import {
  Live2dKey,
  type Live2dEvent,
  type Live2dEventPayload,
  type Live2dHost,
  type Live2dService,
} from '../seams/live2d';

export interface Live2dSeamPluginConfig {
  /** 若为 true，未挂 host 时 playMotion / setExpression 会 no-op 而不是抛错。默认 true */
  tolerateNoHost?: boolean;
}

type Listener = (payload: unknown) => void;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * RendererLive2dProvider —— ctx.live2d 的默认实现。
 *
 * 采用 host 注入模式：本 service 不直接引用 renderer 单例，
 * 消费方（P8 renderer 启动时）通过 `service.attachHost(host)` 传入实际渲染桥。
 * 未挂 host 时，playMotion/setExpression 走 warn 兜底，driveLipSync/setParameter 静默。
 * on(evt, fn) 支持挂 host 前后随时订阅；本 service 维护自己的 fan-out 表并转发。
 */
export class RendererLive2dProvider implements Live2dService {
  private host: Live2dHost | undefined;
  private hostDetach: Array<() => void> = [];
  private readonly listeners = new Map<Live2dEvent, Set<Listener>>();

  constructor(
    private readonly logger: PluginContext['logger'],
    private readonly cfg: Required<Live2dSeamPluginConfig>,
  ) {}

  hasHost(): boolean {
    return this.host !== undefined;
  }

  attachHost(host: Live2dHost): () => void {
    if (this.host) {
      this.logger.warn('[Live2dSeam] host already attached; replacing');
      this.detachHost();
    }
    this.host = host;

    for (const evt of ['touch', 'motion:end'] as const) {
      const off = host.on(evt, (payload) => this.fire(evt, payload));
      this.hostDetach.push(off);
    }
    this.logger.info('[Live2dSeam] host attached');
    return () => this.detachHost();
  }

  private detachHost(): void {
    for (const off of this.hostDetach) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this.hostDetach = [];
    this.host = undefined;
  }

  async playMotion(group: string, index?: number): Promise<void> {
    if (!this.host) return this.noHost('playMotion', { group, index });
    try {
      await this.host.playMotion(group, index);
    } catch (err) {
      this.logger.warn(`[Live2dSeam] playMotion failed: ${(err as Error).message}`);
    }
  }

  async setExpression(name: string): Promise<void> {
    if (!this.host) return this.noHost('setExpression', { name });
    try {
      await this.host.setExpression(name);
    } catch (err) {
      this.logger.warn(`[Live2dSeam] setExpression failed: ${(err as Error).message}`);
    }
  }

  driveLipSync(rms: number): void {
    if (!this.host) return;
    try {
      this.host.driveLipSync(clamp01(rms));
    } catch (err) {
      this.logger.debug(`[Live2dSeam] driveLipSync failed: ${(err as Error).message}`);
    }
  }

  setParameter(id: string, value: number): void {
    if (!this.host) return;
    try {
      this.host.setParameter(id, value);
    } catch (err) {
      this.logger.debug(`[Live2dSeam] setParameter failed: ${(err as Error).message}`);
    }
  }

  on<E extends Live2dEvent>(evt: E, fn: (p: Live2dEventPayload<E>) => void): () => void {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    const set = this.listeners.get(evt)!;
    set.add(fn as Listener);
    return () => {
      set.delete(fn as Listener);
    };
  }

  private fire(evt: Live2dEvent, payload: unknown): void {
    this.listeners.get(evt)?.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        /* ignore listener errors */
      }
    });
  }

  private noHost(op: string, arg: unknown): void {
    if (this.cfg.tolerateNoHost) {
      this.logger.warn(`[Live2dSeam] no host attached, ${op} noop`, arg);
      return;
    }
    throw new Error(`[Live2dSeam] no host attached for ${op}`);
  }
}

export const Live2dSeamPlugin = definePlugin<Live2dSeamPluginConfig>({
  name: 'Live2dSeamPlugin',
  apply(ctx: PluginContext, cfg: Live2dSeamPluginConfig) {
    const merged: Required<Live2dSeamPluginConfig> = {
      tolerateNoHost: cfg.tolerateNoHost ?? true,
    };
    const svc = new RendererLive2dProvider(ctx.logger, merged);
    ctx.provide(Live2dKey, svc);
    ctx.logger.info(`Live2dSeamPlugin ready (tolerateNoHost=${merged.tolerateNoHost})`);
  },
});
