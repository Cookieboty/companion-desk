import { EventBroadcaster, IPCTransportServer, NoopRuntimeLogger } from '@ig-live/ai-runtime';
import { AIClient } from '@ig-live/ai-sdk';
import { LLMRegistryKey, ToolRegistryKey, UserProfileKey } from '@ig-live/bundle-ig-base';
import type { ToolDefinition, UserProfileService } from '@ig-live/bundle-ig-base';

import { makeClientBridge, type ClientBridgeHandle } from './clientBridge';
import { createFakeIpcAdapter, type FakeIpcAdapter, type FakeWebContents } from './fakeIpc';
import { createFakeSdkCtx, type FakeSdkCtx } from './fakeSdkCtx';
import {
  createFakeLLM,
  createFakeLLMRegistry,
  createFakeProfileService,
  createFakeToolRegistry,
  type FakeLLM,
} from './fakeSeams';

export interface E2eRuntimeOptions {
  /** 传入一组预注册的 tool 定义（tools/post-execute 由 emit 手动触发） */
  tools?: ToolDefinition[];
  /** 是否绑定 EventBroadcaster；默认 true */
  broadcastEvents?: boolean;
  /** 允许 fake LLM id 自定义（默认 fake） */
  llmId?: string;
  /** 允许覆盖 UserProfileService（用于 E4 断言写读一致） */
  userProfileService?: UserProfileService;
}

export interface E2eRuntimeHandle {
  ctx: FakeSdkCtx;
  client: AIClient;
  adapter: FakeIpcAdapter;
  transport: IPCTransportServer;
  broadcaster?: EventBroadcaster;
  llm: FakeLLM;
  profileService: UserProfileService;
  /** 每个窗口对应一个 WebContents + 一个 ClientAIClient */
  createRendererClient(opts?: { id?: number }): {
    webContents: FakeWebContents;
    bridge: ClientBridgeHandle['bridge'];
    dispose(): void;
  };
  dispose(): void;
}

/**
 * `createE2eRuntime` —— 复用 FakeIpc 三件套构造出与真实主进程运行时结构等价的
 * 内存环境：`AIClient + IPCTransportServer + EventBroadcaster`。
 * 每个"渲染窗口"通过 `createRendererClient()` 拿到一份连接到 FakeIpc 的 `bridge`，
 * 可用于 `new ClientAIClient({ bridge })`。
 */
export function createE2eRuntime(opts: E2eRuntimeOptions = {}): E2eRuntimeHandle {
  const ctx = createFakeSdkCtx();
  const llm = createFakeLLM(opts.llmId ?? 'fake');
  ctx.provide(LLMRegistryKey, createFakeLLMRegistry(llm));

  const toolRegistry = createFakeToolRegistry();
  for (const tool of opts.tools ?? []) toolRegistry.register(tool);
  ctx.provide(ToolRegistryKey, toolRegistry);

  const profileService = opts.userProfileService ?? createFakeProfileService();
  ctx.provide(UserProfileKey, profileService);
  // 让 profile.set 之后触发 dsh 事件，与 UserPreferenceMemoryPlugin 语义一致；
  // 用 triggerEvent 而不是 emit，才能让 AIClient.bindDshBridges 里的 ctx.on 回调命中，
  // 从而把它映射为 `userProfile:changed` 业务事件供 EventBroadcaster 广播。
  profileService.subscribe('changed', (profile) => {
    void ctx.triggerEvent('userProfile/changed', { profile });
  });

  const client = new AIClient(ctx);
  const adapter = createFakeIpcAdapter();
  const transport = new IPCTransportServer({
    client,
    adapter,
    logger: NoopRuntimeLogger,
  });
  transport.start();

  let broadcaster: EventBroadcaster | undefined;
  if (opts.broadcastEvents !== false) {
    broadcaster = new EventBroadcaster({ adapter, logger: NoopRuntimeLogger });
    broadcaster.start(client);
  }

  const disposers: Array<() => void> = [];

  return {
    ctx,
    client,
    adapter,
    transport,
    broadcaster,
    llm,
    profileService,
    createRendererClient(childOpts) {
      const webContents = adapter.addWebContents(childOpts?.id);
      const handle = makeClientBridge(adapter, webContents);
      disposers.push(handle.dispose);
      return { webContents, bridge: handle.bridge, dispose: handle.dispose };
    },
    dispose() {
      for (const off of disposers.splice(0)) {
        try {
          off();
        } catch {
          /* ignore */
        }
      }
      broadcaster?.stop();
      transport.stop();
      void client.dispose();
      ctx.disposeAll();
    },
  };
}
