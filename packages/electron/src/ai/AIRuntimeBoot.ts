/**
 * AIRuntimeBoot - 主进程 AI 运行时引导器
 *
 * 责任：
 * 1. 装配 `@ig-live/ai-runtime` 单例（Booter + Lifecycle + Logger）；
 * 2. 启动 dsh，得到 `AIClient`；
 * 3. 挂上 `IPCTransportServer`（业务方法反射）、`EventBroadcaster`（事件广播）、
 *    `CapabilityIpcServer`（seams 通道）、`AiChatCompat`（旧通道兼容）；
 * 4. 在 `dispose()` 时逆序清理。
 *
 * 依赖注入通过 `AIRuntimeBootOptions.seams` 提供；未提供的 seam 只是 IPC 通道会返回
 * `SEAM_NOT_INJECTED`，不影响业务门面。
 */

import { app } from 'electron';

import {
  AiChatCompat,
  CapabilityIpcServer,
  EventBroadcaster,
  IPCTransportServer,
  createDshBooter,
  createElectronIpcAdapter,
  createElectronLifecycle,
  runtime,
  type Booter,
  type RuntimeLogger,
} from '@ig-live/ai-runtime';
import type { AIClient } from '@ig-live/ai-sdk';

import type { ILoggerService } from '../services/LoggerService';

export interface AIRuntimeBootSeams {
  keyStore?: unknown;
  clipboard?: unknown;
  screen?: unknown;
}

export interface AIRuntimeBootOptions {
  profile?: string;
  home?: string;
  booter?: Booter;
  seams?: AIRuntimeBootSeams;
  /** 是否启用旧 `ai-chat:*` 通道兼容层，默认 true */
  enableLegacyCompat?: boolean;
  /** 是否挂 CapabilityIpcServer（若 seams 均未注入，可跳过），默认 true */
  enableCapabilityIpc?: boolean;
  /** 是否挂事件广播，默认 true */
  enableEventBroadcast?: boolean;
}

export interface AIRuntimeBootHandle {
  client: AIClient;
  profile: string;
  channels: {
    business: readonly string[];
  };
  dispose(): Promise<void>;
}

/**
 * 把 ILoggerService 适配成 RuntimeLogger（同名方法即可）。
 */
function toRuntimeLogger(l: ILoggerService): RuntimeLogger {
  return {
    info: (msg, meta) => l.info(String(msg), meta as Record<string, unknown> | undefined),
    warn: (msg, meta) =>
      l.warn(String(msg), meta as Record<string, unknown> | undefined),
    error: (msg, meta) =>
      l.error(String(msg), meta as Record<string, unknown> | undefined),
  };
}

/**
 * 启动 AI runtime；调用方一般在 Application.start() → app.whenReady() 后调用。
 */
export async function startAIRuntime(
  logger: ILoggerService,
  opts: AIRuntimeBootOptions = {},
): Promise<AIRuntimeBootHandle> {
  const profile = opts.profile ?? 'waifu';
  const home = opts.home ?? app.getAppPath();
  const runtimeLogger = toRuntimeLogger(logger);

  const booter = opts.booter ?? createDshBooter();
  const lifecycle = createElectronLifecycle();
  const service = runtime.configure({ booter, lifecycle, logger: runtimeLogger });
  const client = await service.start(profile, { home });

  const adapter = createElectronIpcAdapter();

  const transport = new IPCTransportServer({
    client,
    adapter,
    logger: runtimeLogger,
  });
  transport.start();

  let broadcaster: EventBroadcaster | undefined;
  if (opts.enableEventBroadcast !== false) {
    broadcaster = new EventBroadcaster({ adapter, logger: runtimeLogger });
    broadcaster.start(client);
  }

  let capability: CapabilityIpcServer | undefined;
  if (opts.enableCapabilityIpc !== false) {
    const seams = opts.seams ?? {};
    capability = new CapabilityIpcServer({
      adapter,
      logger: runtimeLogger,
      injector: {
        getScreen: () => seams.screen,
        getClipboard: () => seams.clipboard,
        getKeyStore: () => seams.keyStore,
      },
    });
    capability.start();
  }

  let compat: AiChatCompat | undefined;
  if (opts.enableLegacyCompat !== false) {
    compat = new AiChatCompat({ adapter, client, logger: runtimeLogger });
    compat.start();
  }

  logger.info(`AI runtime ready (profile=${profile})`, {
    channels: transport.channels.length,
    home,
  });

  return {
    client,
    profile,
    channels: {
      business: transport.channels,
    },
    async dispose() {
      try {
        compat?.stop();
      } catch (err) {
        logger.warn('AiChatCompat.stop threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        capability?.stop();
      } catch (err) {
        logger.warn('CapabilityIpcServer.stop threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        broadcaster?.stop();
      } catch (err) {
        logger.warn('EventBroadcaster.stop threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        transport.stop();
      } catch (err) {
        logger.warn('IPCTransportServer.stop threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await runtime.stop();
      logger.info('AI runtime stopped');
    },
  };
}
