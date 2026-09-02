# 三端消费方接入 Checklist

> P8-9 交付物。适用于把「主进程 / renderer（看板娘） / ai-chat」三端接入 dsh + `@ig-live/ai-sdk-client` 的最短路径。
>
> 迁移总纲：[P8-consumer-migration.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md)　·　变更时间线：[docs/plans/CHANGELOG.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md)　·　旧通道映射：[legacy-channel-mapping.md](file:///Users/botycookie/self/ai-live2d-client/docs/legacy-channel-mapping.md)

## 0. 心智模型

```
              ┌───────────────────────── Electron 主进程 ──────────────────────────┐
              │                                                                    │
              │  Application.startAIRuntime()                                     │
              │     └── startAIRuntime(logger, { profile, seams, ttsProviders })  │
              │            ├── runtime.configure({ booter, lifecycle })           │
              │            ├── runtime.start(profile, { home })  → AIClient       │
              │            ├── IPCTransportServer(client)          [ai:*]         │
              │            ├── EventBroadcaster(client)            [ai:event]     │
              │            ├── CapabilityIpcServer(seams)          [ai:cap:*]     │
              │            └── AiChatCompat(client)                [ai:legacy:*]  │
              │                                                                    │
              └──────────────────────────────┬─────────────────────────────────────┘
                                             │  ai:* / ai:event / ai:legacy:*
                                             ▼
                          ┌──────────── preload (mkAiPreload) ────────────┐
                          │  contextBridge.exposeInMainWorld('aiIPC', …)  │
                          └───────────────────────┬───────────────────────┘
                                                  │  window.aiIPC.{invoke,on,off}
                                                  ▼
              ┌───────────── renderer / ai-chat（React） ──────────────┐
              │  <AIProvider>  ──→  ClientAIClient (IPC Proxy)         │
              │     ├── useChat()             / useAgent()             │
              │     ├── useAIEvents()         / useTTSLipSync()        │
              │     └── useUserProfile()                               │
              └────────────────────────────────────────────────────────┘
```

关键包：

- [@ig-live/ai-runtime](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime) —— 主进程装配（dsh Booter + IPCTransportServer + EventBroadcaster + CapabilityIpcServer + AiChatCompat）。
- [@ig-live/ai-sdk](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk) —— 主进程 `AIClient` 门面（P5）。
- [@ig-live/ai-sdk-client](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client) —— 渲染进程 `ClientAIClient`（IPC Proxy）+ 5 个 React Hook + preload 模板。
- [profiles/](file:///Users/botycookie/self/ai-live2d-client/profiles) —— `waifu` / `chat-only` / `mcp-headless` 三份 dsh profile，装载不同的 seam & bundle。

## 1. 主进程（Electron main）

### 1.1 预检

- [ ] `pnpm --filter @ig-live/electron install`：依赖已含 `@ig-live/ai-runtime`、`@ig-live/ai-sdk`、`@deepseek-ai/dsh*`（版本三处锁死，见 [README.md#dsh-基座版本策略](file:///Users/botycookie/self/ai-live2d-client/README.md#-dsh-基座版本策略)）。
- [ ] `pnpm run doctor <profile>` 装配诊断通过（[scripts/dsh-doctor.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/dsh-doctor.ts)）。
- [ ] 明确 profile：`waifu`（看板娘 + TTS + Live2D） / `chat-only`（纯聊天）/ `mcp-headless`（CLI）。

### 1.2 装配 AI Runtime

在 [Application.start()](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/core/Application.ts#L100-L112) 里 `app.whenReady()` 之后调用一次：

```ts
import { startAIRuntime } from '@ig-live/electron/ai';
import { SafeKeyProvider, ClipboardGateway, ScreenCapture } from '@ig-live/electron/ai/seams';
import { AdvancedTTSEngine } from '@ig-live/electron/services/AdvancedTTSEngine';
import { TtsElectronNativeProvider } from '@ig-live/electron/ai/TtsElectronNativeProvider';

const handle = await startAIRuntime(logger, {
  profile: 'waifu', // 或 chat-only / mcp-headless
  home: app.getAppPath(),
  seams: {
    keyStore: new SafeKeyProvider(), // 走 safeStorage 加解密
    clipboard: new ClipboardGateway(),
    screen: new ScreenCapture(),
  },
  ttsProviders: [new TtsElectronNativeProvider({ engine: new AdvancedTTSEngine() })],
  enableLegacyCompat: true, // 默认 true；发布时按弃用时间线关闭
  enableCapabilityIpc: true,
  enableEventBroadcast: true,
});
```

### 1.3 生命周期

- [ ] `before-quit` 前调用 `handle.dispose()`（[Application.stop()](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/core/Application.ts#L174-L189) 已封装）。
- [ ] 启动日志出现 `AI runtime ready (profile=<profile>)`；`channels.business.length > 0`。
- [ ] `SEAM_NOT_INJECTED`：若当前 profile 未装载对应 bundle（如 chat-only 没有 TTS），`tryRegisterTtsProviders` 会 warn 不抛，属预期行为。

### 1.4 旧通道兼容

- [ ] `enableLegacyCompat=true` 时 [AiChatCompat](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/legacy/AiChatCompat.ts) 会挂 `ai:legacy:ai-chat:*`；每次调用 warn `deprecated: ai:legacy:<method>`。
- [ ] 保留 2 个 minor 版本后移除，见 [CHANGELOG#Deprecated](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md#deprecated)。

## 2. Preload（renderer / ai-chat 各一份）

参考 [docs/preload-usage.md](file:///Users/botycookie/self/ai-live2d-client/docs/preload-usage.md)。

- [ ] `BrowserWindow` 必须 `contextIsolation: true` + `sandbox: true`。
- [ ] preload 脚本：

  ```ts
  import { contextBridge, ipcRenderer } from 'electron';
  import { mkAiPreload } from '@ig-live/ai-sdk-client/preload';

  mkAiPreload({ contextBridge, ipcRenderer }); // window.aiIPC
  // 多窗口冲突时：mkAiPreload({ contextBridge, ipcRenderer, bridgeName: 'aiChatIPC' });
  ```

- [ ] 白名单：`assertChannel` 只放行 `ai:` 前缀 + `[A-Za-z0-9_:-]` + ≤ 96 字节。
- [ ] devtools 里 `await window.aiIPC.invoke('ai:chat:sendMessage', { messages: [{ role: 'user', content: 'ping' }] })` 能返回 `AIMessage`。

## 3. 渲染进程（React：renderer 或 ai-chat）

### 3.1 挂载 Provider

```tsx
import { AIProvider } from '@ig-live/ai-sdk-client/react';

export function Root() {
  // 未传 bridge，Provider 会读取 window.aiIPC；生产环境仅当 window.aiIPC 就绪时挂载
  if (typeof window === 'undefined' || !window.aiIPC) return <App />;
  return (
    <AIProvider>
      <App />
    </AIProvider>
  );
}
```

> 自定义 bridgeName：`<AIProvider bridgeName="aiChatIPC">`；或注入外部 client：`<AIProvider client={new ClientAIClient({ bridgeName: 'aiChatIPC' })}>`。

### 3.2 5 个 Hook 一览

| Hook                                                                                                                | 责任                               | 关键 API                                                               |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| [useChat](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useChat.ts)               | 消息流转                           | `messages / streaming / send(text) / abort() / regenerate() / reset()` |
| [useAgent](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useAgent.ts)             | agent 步骤 + 危险工具确认          | `steps / pending / confirm(id, ok)`                                    |
| [useAIEvents](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useAIEvents.ts)       | 订阅任意 `AIClientEvent`           | `useAIEvents(evt, handler)`                                            |
| [useTTSLipSync](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useTTSLipSync.ts)   | 订阅 `tts:chunk` 输出 rms `[0..1]` | `const rms = useTTSLipSync()`                                          |
| [useUserProfile](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useUserProfile.ts) | 读/写 `UserProfile`                | `{ profile, loading, set, reset, exportSnapshot, importSnapshot }`     |

### 3.3 校验点

- [ ] `pnpm --filter @ig-live/<renderer|ai-chat> typecheck build test` 全绿。
- [ ] devtools 里 `useChat().send('你好')` 能看到 chunks 追加到 `messages`。
- [ ] `useTTSLipSync()` 在 waifu profile 下 rms 波动 > 0；chat-only 下恒为 0（无 TTS 是预期）。
- [ ] `useUserProfile().set({ preferences: { … } })` 后所有订阅者立即 rerender。

### 3.4 看板娘专属（waifu profile）

- [ ] Live2D 嘴型：`useTTSLipSync()` → 写入 [lipSyncStore](file:///Users/botycookie/self/ai-live2d-client/packages/renderer/src/ai/lipSyncStore.ts) → [useLive2DModel](file:///Users/botycookie/self/ai-live2d-client/packages/renderer/src/hooks/useLive2DModel.ts) 每帧写 `PARAM_MOUTH_OPEN_Y`。
- [ ] Live2D 场景注册器（`ctx.live2d.registerSceneProvider`）与 `waifuTipsTool` 挂钩留待 P8-3 后续子任务；参考 [P8-3 尚未落地子项](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-3-看板娘接入renderer)。

## 4. 迁移遗留数据 / 配置（可选）

三个纯 Node 脚本，均支持 `--dry-run`：

```bash
# 1) 旧 AIModelConfig[] → dsh llm.providers[]
pnpm exec tsx scripts/migrate-config.ts --input userData/config.json --dry-run

# 2) 旧 chat_history.json → dsh 每会话 JSONL
pnpm exec tsx scripts/migrate-history.ts --input userData/chat_history.json --dry-run

# 3) 旧 chat settings → dsh UserProfile
pnpm exec tsx scripts/migrate-user-profile.ts --input userData/settings.json --dry-run
```

产物落盘位置：

- 会话：`<userData>/ai-chat/sessions/<sessionId>.jsonl`
- Profile：`<userData>/ai-chat/memory/user_profile.json`
- 密钥：由 Electron 侧消费 `_secretPayload` 交给 [SafeKeyProvider.set](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/SafeKeyProvider.ts) 写入 `<userData>/keys/<keyRef>.bin`

单测：[scripts/**tests**/](file:///Users/botycookie/self/ai-live2d-client/scripts/__tests__)（共 14 用例，已并入 `pnpm test`）。

## 5. 三 profile 能力矩阵

| Facade / 能力                                              | waifu | chat-only | mcp-headless |
| ---------------------------------------------------------- | :---: | :-------: | :----------: |
| `chat.stream` / `chat.sendMessage`                         |  ✅   |    ✅     |      ✅      |
| `sessions.*`                                               |  ✅   |    ✅     |      ✅      |
| `tools.list` / `tools.confirm`                             |  ✅   |    ✅     |      ✅      |
| `memory.userProfile` / `memory.facts` / `memory.summaries` |  ✅   |    ✅     |      ✅      |
| `asr.transcribe`                                           |  ✅   |   部分    |      ❌      |
| `tts.synth` / `tts.stream` / `electron-native`             |  ✅   |    ❌     |      ❌      |
| `live2d.*`                                                 |  ✅   |    ❌     |      ❌      |

> UI 层用 `client.getEnabledFacades()`（或对空 facade 做防御）灰置对应按钮。

## 6. 上线自检

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿。
- [ ] `pnpm run doctor waifu && pnpm run doctor chat-only && pnpm run doctor mcp-headless`。
- [ ] `pnpm --filter @ig-live/electron dev` 启动，控制台无 `AIService` / `Mock` 关键字，出现 `AI runtime ready`。
- [ ] E2E 冒烟（P8-8）：Playwright electron 用例矩阵 E1~E4；waifu 视觉断言只做数值断言。
- [ ] 迁移脚本 dry-run 无异常，`.legacy.json` 备份齐全。
- [ ] 观察生产日志 `deprecated: ai:legacy:*` 出现频率 → 决定何时把 `enableLegacyCompat` 切 false。

## 7. 常见坑

| 症状                                        | 排查                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `[ai-runtime] client 未初始化`              | 主进程忘了 `await startAIRuntime()`；或在 `whenReady` 之前调用了 `runtime.client`。                                               |
| `<AIProvider> 未挂载`                       | 渲染层组件树少一层 Provider；或 `window.aiIPC` 未就绪就直接构造 `ClientAIClient`。                                                |
| `[ai-preload] channel 'xxx' 缺少前缀 'ai:'` | preload 层通道名违反白名单；检查是否把 `ai-chat:*` 直接透传给了 `invoke`（应走 `AiChatCompat` 的 `ai:legacy:*`）。                |
| `SEAM_NOT_INJECTED`                         | 当前 profile 未装 seam；`tryRegisterTtsProviders` 只 warn；`CapabilityIpcServer` 会返回 `SEAM_NOT_INJECTED` 错误，UI 侧灰置即可。 |
| `deprecated: ai:legacy:*` 一直刷            | UI 还在走旧通道，尚未迁移到 `window.aiIPC.invoke('ai:<facade>:<method>', …)` 或 `ClientAIClient`。                                |

## 引用

- 计划：[P8-consumer-migration.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md)
- 变更：[docs/plans/CHANGELOG.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md)
- Preload 深入：[docs/preload-usage.md](file:///Users/botycookie/self/ai-live2d-client/docs/preload-usage.md)
- 旧通道映射：[docs/legacy-channel-mapping.md](file:///Users/botycookie/self/ai-live2d-client/docs/legacy-channel-mapping.md)
- 设计基线：[docs/AI_HARNESS_DESIGN.md](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md)
