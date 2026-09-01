# P3 · L0.5 · Bundle Electron 主进程能力（bundle-ig-electron-caps）

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L0.5（Electron 主进程 dsh bundle） |
| 依赖 Plan | [P2](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md) |
| 建议 Sprint | Sprint 2（并行） |
| 预估工作量 | 8~10 人日 |
| 关联设计章节 | [§3.0.3](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L340-L361) / [§14 P3](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1746-L1761) |

## 目标

一句话：**把只在 Electron 主进程才有的能力封成 dsh bundle**——safeStorage 密钥、文件会话持久化、屏幕/剪贴板 seam、ASR/TTS/唤醒/全局快捷键——让 `chat-only.yml` 加载后 `ctx.asr/tts/screen/clipboard` 全部就绪。

## 准入前提

- [P2](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md) 全部退出准则达成（`ctx.userProfile` 可用；本包会覆盖其存储后端为文件版）。

## 范围

**包含**：SafeKeyStore、FileSessionStore、Screen/Clipboard seam、ASR（3 provider）、TTS（4 provider）、WakeWord、Shortcut、UserProfile 文件存储后端。

**不包含**：任何 UI、渲染进程能力（→ P4/P7）。

## 任务清单

### P3-1 · 包骨架

- 从 template 复制到 [packages/bundle-ig-electron-caps](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps)
- `package.json.dsh.bundle`、`peerDependencies: electron @ig-live/bundle-ig-base @deepseek-ai/dsh`
- [src/patch.yml](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/patch.yml) 默认配置
- **仅在主进程加载**：`index.ts` 顶部 `if (!process.versions.electron || process.type !== 'browser') throw`
- 验收：`chat-only.yml` 挂上后 `pnpm doctor chat-only` 通过（在 Electron main 上下文里）

### P3-2 · SafeKeyStorePlugin

- 新建 [src/plugins/SafeKeyStorePlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/SafeKeyStorePlugin.ts)
- 新建 [src/seams/keyStore.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/seams/keyStore.ts)：`KeyStoreService { get(id); set(id, v); del(id); list(); }`
- 用 `electron.safeStorage.encryptString/decryptString`，若 `safeStorage.isEncryptionAvailable() === false` 则**明确抛错**（不允许明文兜底）
- 落盘位置：`app.getPath('userData')/ai-chat/keys.enc`
- 单元测试：mock safeStorage 双向
- 验收：`ctx.keyStore.set('openai', 'sk-xxx'); ctx.keyStore.get('openai')` 返回原值

### P3-3 · FileSessionStorePlugin（覆盖 dsh 会话存储 + UserProfile 存储）

- 新建 [src/plugins/FileSessionStorePlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/FileSessionStorePlugin.ts)
- 覆盖 `ctx.sessions` 的 `IStorage`（JSONL append-only；每 session 一个文件；轮转 100MB）
- 覆盖 [P2 UserProfileStorePlugin](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md#p2-72-userprofilestoreplugin--seam) 注入的 `IProfileStorage`：落 `userData/ai-chat/memory/user_profile.json`；写时用原子替换（write→rename）
- 验收：kill 进程后重新启动能读回上一会话与偏好

### P3-4 · Screen / Clipboard seam

- 新建 [src/seams/screen.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/seams/screen.ts)：`ScreenService { listDisplays(); capture(display?, area?) }`
- 新建 [src/seams/clipboard.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/seams/clipboard.ts)：`ClipboardService { readText(); writeText(); readImage(); on('change') }`
- 分别用 `desktopCapturer` / `clipboard`
- Clipboard 变化监听用 200ms 轮询（macOS/Windows 一致）
- 验收：单元 + 手工

### P3-5 · AsrPlugin（3 provider + `ctx.asr` seam）

- 新建 [src/seams/asr.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/seams/asr.ts)：`AsrService { transcribe(pcm, opts); stream(pcmStream, opts); list() }`
- 目录 [src/plugins/asr/](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/asr)
  - `WhisperLocalProvider.ts`（`nodejs-whisper` 或 `whisper.cpp` binding；模型走首启动向导下载到 `models/whisper/`）
  - `OpenAIWhisperProvider.ts`（`audio/transcriptions`）
  - `VolcAsrProvider.ts`（火山 ASR WebSocket）
- 音频格式统一：16k / 16bit / mono PCM
- 验收：3 家分别跑 fixture wav 输出文本

### P3-6 · TtsPlugin（4 provider + `ctx.tts` seam）

- 新建 [src/seams/tts.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/seams/tts.ts)：`TtsService { synth(text, opts); stream(text, opts): AsyncIterable<TTSChunk>; stop(reqId); listVoices() }`
- 目录 [src/plugins/tts/](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/tts)
  - `SystemTtsProvider.ts`（macOS `say` / Windows `SAPI`）
  - `EdgeTtsProvider.ts`
  - `OpenAiTtsProvider.ts`
  - `AzureTtsProvider.ts`
- 每个 TTSChunk 附带 `rms` 用于 P4 [TtsLipSyncPlugin](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P4-bundle-ig-live2d.md#p4-4-ttslipsyncplugin) 驱动嘴型
- 验收：4 家分别合成 5s 音频且能被浏览器播放

### P3-7 · WakeWordPlugin（Porcupine，可关）

- 新建 [src/plugins/WakeWordPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/WakeWordPlugin.ts)
- 依赖 `@picovoice/porcupine-node`，access key 从 `ctx.keyStore.get('porcupine')` 读
- 触发时 emit `wakeword/detected` 事件 → 由消费方决定是否开始 ASR
- 默认关闭；`patch.id: wakeword.default.config.enabled = false`
- 验收：本地 wav 回放触发检测断言

### P3-8 · ShortcutPlugin

- 新建 [src/plugins/ShortcutPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/ShortcutPlugin.ts)
- 用 `globalShortcut`：默认 `Cmd/Ctrl+Shift+Space` = toggle 唤醒；`Cmd/Ctrl+Shift+X` = 截屏送 Agent
- 每个快捷键映射到 `ctx.commands.dispatch(cmd)`
- 生命周期：`app.will-quit` 自动 unregister
- 验收：注册/触发/注销三路径手工验证

### P3-9 · Electron 集成测试

- 采用 `playwright-electron` 或 `spectron` 起主进程
- 场景：safeStorage 双向 / capture 返回 buffer / say-hello 走完 TTS chunk 流
- 归到 CI 的 `test:e2e` task（跑 macos + windows）

## 交付物

- 1 个可发布 npm 包 [@ig-live/bundle-ig-electron-caps](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps)
- 4 个新 seam（keyStore / screen / clipboard / asr / tts）
- 8 个 provider（1 keyStore + 3 asr + 4 tts）

## 退出准则（自动化）

1. `pnpm --filter @ig-live/bundle-ig-electron-caps build test` 全绿
2. Electron 主进程集成测试通过（macos + windows）
3. `chat-only.yml` 加载后 `ctx.asr.list().length===3 && ctx.tts.list().length===4`
4. `ctx.keyStore.set/get` 加密路径生效（`safeStorage.isEncryptionAvailable()===true` 场景）

## 测试策略

- 单元：mock electron API（`electron-mock-ipc`）
- 集成：真 Electron 主进程环境
- 平台矩阵：macos-latest + windows-latest（Linux 不做 TTS 支持声明）

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| safeStorage 在 Linux/无 keyring 场景不可用 | 启动即抛错 + 引导用户走首启动向导；不允许明文兜底 |
| Porcupine 商业授权 | 提供开关；文档标注 access key 需求 |
| WhisperLocal 模型体积大 | 首启动向导按需下载；可选 tiny / base / small |
| 全局快捷键在 macOS 需辅助功能授权 | 首启动向导引导 |
