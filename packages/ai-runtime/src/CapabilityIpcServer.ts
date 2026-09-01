/**
 * CapabilityIpcServer —— 把 P3 electron-caps 的 seams 直接暴露成 IPC 通道。
 *
 * 通道命名：`ai:<capability>:<method>`（与业务 Facade 通道同前缀，便于 renderer 统一 preload）。
 * 大对象（`ScreenService.capture`）返回的 `data` 是 `Uint8Array`；Electron 内部 IPC 已经用
 * 结构化克隆 + transferable buffer，Zero-copy 不达标但拷贝一次可接受。若后续遇到瓶颈可切
 * 换 `MessagePortMain`。
 *
 * 服务从 `AIClient` 关联的 `SdkContext` 拿；未注入时通道会直接抛 `SEAM_NOT_INJECTED`。
 */

import type { IpcAdapter } from './IpcAdapter';
import type { RuntimeLogger } from './logger';
import { ConsoleRuntimeLogger } from './logger';

export interface CapabilityInjector {
  getScreen(): unknown | undefined;
  getClipboard(): unknown | undefined;
  getKeyStore(): unknown | undefined;
}

export interface CapabilityIpcServerOptions {
  adapter: IpcAdapter;
  injector: CapabilityInjector;
  logger?: RuntimeLogger;
}

export const CAPABILITY_CHANNELS = Object.freeze([
  'ai:screen:listDisplays',
  'ai:screen:capture',
  'ai:clipboard:readText',
  'ai:clipboard:writeText',
  'ai:clipboard:readImage',
  'ai:keyStore:get',
  'ai:keyStore:set',
  'ai:keyStore:del',
  'ai:keyStore:list',
] as const);

export class CapabilityIpcServer {
  private started = false;
  private readonly logger: RuntimeLogger;

  constructor(private readonly opts: CapabilityIpcServerOptions) {
    this.logger = opts.logger ?? ConsoleRuntimeLogger;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { adapter, injector } = this.opts;

    const requireSvc = <T>(name: string, get: () => T | undefined): T => {
      const svc = get();
      if (!svc) throw new Error(`[ai-runtime] SEAM_NOT_INJECTED: ${name}`);
      return svc;
    };

    adapter.handle('ai:screen:listDisplays', async () =>
      (
        requireSvc('screen', () => injector.getScreen()) as { listDisplays: () => Promise<unknown> }
      ).listDisplays(),
    );
    adapter.handle('ai:screen:capture', async (_e, opts) =>
      (
        requireSvc('screen', () => injector.getScreen()) as {
          capture: (o: unknown) => Promise<unknown>;
        }
      ).capture(opts),
    );

    adapter.handle('ai:clipboard:readText', async () =>
      (
        requireSvc('clipboard', () => injector.getClipboard()) as {
          readText: () => Promise<string>;
        }
      ).readText(),
    );
    adapter.handle('ai:clipboard:writeText', async (_e, text) =>
      (
        requireSvc('clipboard', () => injector.getClipboard()) as {
          writeText: (t: string) => Promise<void>;
        }
      ).writeText(text as string),
    );
    adapter.handle('ai:clipboard:readImage', async () =>
      (
        requireSvc('clipboard', () => injector.getClipboard()) as {
          readImage: () => Promise<unknown>;
        }
      ).readImage(),
    );

    adapter.handle('ai:keyStore:get', async (_e, id) =>
      (
        requireSvc('keyStore', () => injector.getKeyStore()) as {
          get: (id: string) => Promise<string | undefined>;
        }
      ).get(id as string),
    );
    adapter.handle('ai:keyStore:set', async (_e, id, value) =>
      (
        requireSvc('keyStore', () => injector.getKeyStore()) as {
          set: (id: string, value: string) => Promise<void>;
        }
      ).set(id as string, value as string),
    );
    adapter.handle('ai:keyStore:del', async (_e, id) =>
      (
        requireSvc('keyStore', () => injector.getKeyStore()) as {
          del: (id: string) => Promise<void>;
        }
      ).del(id as string),
    );
    adapter.handle('ai:keyStore:list', async () =>
      (
        requireSvc('keyStore', () => injector.getKeyStore()) as { list: () => Promise<string[]> }
      ).list(),
    );

    this.logger.info(`capability ipc ready · ${CAPABILITY_CHANNELS.length} channels`);
  }

  stop(): void {
    if (!this.started) return;
    for (const ch of CAPABILITY_CHANNELS) {
      try {
        this.opts.adapter.removeHandler(ch);
      } catch (err) {
        this.logger.warn(`removeHandler(${ch}) threw`, err);
      }
    }
    this.started = false;
  }
}
