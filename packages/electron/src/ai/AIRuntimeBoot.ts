/**
 * AIRuntimeBoot - 主进程 AI 运行时引导器
 *
 * 责任：
 * 1. 装配 `@ig-live/ai-runtime` 单例（Booter + Lifecycle + Logger）；
 * 2. 启动 IgPluginHost + AI SDK providers，得到 `AIClient`；
 * 3. 挂上 `IPCTransportServer`（业务方法反射）、`EventBroadcaster`（事件广播）、
 *    `CapabilityIpcServer`（seams 通道）、`AiChatCompat`（旧通道兼容）；
 * 4. 可选：把遗留 `AdvancedTTSEngine` 注册为 `electron-native` TtsProvider（P8-5 尾巴）；
 * 5. 在 `dispose()` 时逆序清理。
 *
 * 依赖注入通过 `AIRuntimeBootOptions.seams` 提供；未提供的 seam 只是 IPC 通道会返回
 * `SEAM_NOT_INJECTED`，不影响业务门面。
 */

import { existsSync } from 'fs';
import * as path from 'path';

import {
  AiChatCompat,
  CapabilityIpcServer,
  EventBroadcaster,
  IPCTransportServer,
  ProviderIpcServer,
  ProviderService,
  ProviderStore,
  createAiSdkBooter,
  createSafeStorageCipher,
  llmProvidersFromEnv,
  createElectronIpcAdapter,
  createElectronLifecycle,
  runtime,
  type Booter,
  type RoutedLLMRegistry,
  type RuntimeLogger,
} from '@ig-live/ai-runtime';
import type { AIClient } from '@ig-live/ai-sdk';
import { FileSessionStorePlugin } from '@ig-live/bundle-ig-electron-caps';
import { app, safeStorage } from 'electron';

import type { ILoggerService } from '../services/LoggerService';

import type { TtsProvider } from './TtsElectronNativeProvider';

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
  /**
   * 额外要注入到 `client.tts` 的本地 TtsProvider 列表（例如
   * [TtsElectronNativeProvider](file:///./TtsElectronNativeProvider.ts)）。
   *
   * 语义：
   *   - 注入时机在 `client` 就绪之后、CapabilityIpc / EventBroadcaster 挂载之前；
   *   - 若当前 profile 未装载 `bundle-ig-electron-caps` 的 `TtsPlugin`，
   *     `client.tts.register` 会抛 `SEAM_NOT_INJECTED`，本函数**吞掉**该错误
   *     并 `logger.warn` 提示（避免阻塞主流程）；其它异常照常向外抛。
   */
  ttsProviders?: TtsProvider[];
}

export interface AIRuntimeBootHandle {
  client: AIClient;
  profile: string;
  /** 多 provider 配置服务（面板 / 托盘切换） */
  providers: ProviderService;
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
    warn: (msg, meta) => l.warn(String(msg), meta as Record<string, unknown> | undefined),
    error: (msg, meta) => l.error(String(msg), meta as Record<string, unknown> | undefined),
  };
}

function tryRegisterTtsProviders(
  client: AIClient,
  providers: TtsProvider[],
  logger: ILoggerService,
): void {
  if (providers.length === 0) return;
  for (const provider of providers) {
    try {
      // client.tts.register 内部会 `require()` TtsService；未注入时抛 SEAM_NOT_INJECTED。
      // 这里对 register 参数做一次协变转型：electron 侧本地契约与 seams 结构等价，
      // 但 electron tsconfig `moduleResolution: node` 无法直接解析 `@ig-live/bundle-ig-electron-caps/seams`
      // 子入口，故用 unknown 中转，等价性靠单测保证。
      (client.tts.register as (p: TtsProvider) => void)(provider);
      logger.info(`TtsProvider registered: id=${provider.info.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string } | null)?.code;
      if (code === 'SEAM_NOT_INJECTED') {
        logger.warn(
          `TtsProvider skipped: ctx.tts not injected (profile 未加载 bundle-ig-electron-caps?); provider=${provider.info.id}`,
        );
        continue;
      }
      logger.error(`TtsProvider register failed: id=${provider.info.id}`, { error: message });
      throw err;
    }
  }
}

/**
 * 定位 dsh profile 根目录（其下有 `profiles/<name>/package.json`）。
 *
 * - 开发 / 未打包生产（`electron packages/electron`）：`app.getAppPath()` 是
 *   `packages/electron`，profiles 在仓库根目录，逐级向上查找；
 * - 打包产物：`process.resourcesPath`（若随包带了 profiles）；
 * - 都找不到时回退 `app.getAppPath()`（仅 optional dsh / doctor 需要 profiles）。
 */
export function resolveProfileHome(profile: string): string {
  const candidates: string[] = [];
  if (app.isPackaged && process.resourcesPath) candidates.push(process.resourcesPath);
  let dir = app.getAppPath();
  for (let i = 0; i < 4; i++) {
    candidates.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const hit = candidates.find((c) => existsSync(path.join(c, 'profiles', profile, 'package.json')));
  return hit ?? app.getAppPath();
}

/**
 * 启动 AI runtime；调用方一般在 Application.start() → app.whenReady() 后调用。
 */
export async function startAIRuntime(
  logger: ILoggerService,
  opts: AIRuntimeBootOptions = {},
): Promise<AIRuntimeBootHandle> {
  const profile = opts.profile ?? process.env.IG_AI_PROFILE ?? 'waifu';
  const home = opts.home ?? resolveProfileHome(profile);
  const runtimeLogger = toRuntimeLogger(logger);

  // Optional dsh state dir (only used when IG_DSH_CORE=auto|required and dsh is installed)
  if (!process.env.DSH_HOME?.trim()) {
    process.env.DSH_HOME = path.join(app.getPath('userData'), 'dsh');
  }

  // 多 provider 配置：仅本地 userData，key 用 safeStorage 加密（不可用时明文回退 + 警告）
  const cipher = createSafeStorageCipher(safeStorage);
  const providerStore = new ProviderStore({
    filePath: path.join(app.getPath('userData'), 'ai-providers.json'),
    cipher,
  });
  if (cipher.kind === 'none') {
    logger.warn(
      '系统安全存储（safeStorage）不可用：provider token 仅做编码保存，未加密。面板中会提示用户。',
    );
  }
  let registry: RoutedLLMRegistry | undefined;
  const providerService = new ProviderService({
    store: providerStore,
    envEntries: llmProvidersFromEnv(process.env),
    getRegistry: () => registry,
    overrideId: process.env.COMPANION_PROVIDER?.trim() || undefined,
  });

  const booter =
    opts.booter ??
    createAiSdkBooter({
      logger: runtimeLogger,
      // FileSessionStorePlugin 提供 ProfileStorageKey → 用户画像持久化到 userData/ai-chat/memory
      before: [{ plugin: FileSessionStorePlugin }],
      providers: {
        store: providerStore,
        onRegistry: (r) => {
          registry = r;
        },
      },
    });
  const lifecycle = createElectronLifecycle();
  const service = runtime.configure({ booter, lifecycle, logger: runtimeLogger });
  const client = await service.start(profile, { home });

  if (opts.ttsProviders && opts.ttsProviders.length > 0) {
    tryRegisterTtsProviders(client, opts.ttsProviders, logger);
  }

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

  const providerIpc = new ProviderIpcServer({
    adapter,
    service: providerService,
    logger: runtimeLogger,
  });
  providerIpc.start();

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
    providers: providerService,
    channels: {
      business: transport.channels,
    },
    async dispose() {
      try {
        providerIpc.stop();
        providerStore.flush();
        registry?.dispose();
      } catch (err) {
        logger.warn('ProviderIpcServer.stop threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
