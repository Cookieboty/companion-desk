# P8 · L4 · 三端消费方接入与迁移

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L4（消费方 / 业务集成层） |
| 依赖 Plan | [P4](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P4-bundle-ig-live2d.md) + [P7](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P7-ai-sdk-client.md) |
| 建议 Sprint | Sprint 5（1.5 周） |
| 预估工作量 | 8~10 人日 |
| 关联设计章节 | [§13](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1560-L1668) / [§14 P8](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1834-L1860) |

## 目标

一句话：**将 [electron](file:///Users/botycookie/self/ai-live2d-client/packages/electron) 主进程、[renderer](file:///Users/botycookie/self/ai-live2d-client/packages/renderer)（看板娘）、[ai-chat](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat)（对话 UI）三端全部切换为通过 SDK/Runtime/Client 访问 AI 能力，同时下线所有旧的直连、Mock 与重复 IPC 定义。**

## 准入前提

- [P4](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P4-bundle-ig-live2d.md) 完成：看板娘 bundle（Live2dSeam / TtsLipSync / WaifuAgent）可加载
- [P7](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P7-ai-sdk-client.md) 完成：`@ig-live/ai-sdk-client` 可发布并稳定
- 三个 profile（waifu / chat-only / mcp-headless）冒烟通过（[P1](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P1-dsh-kernel-adoption.md) 退出准则）

## 范围与非范围

**范围**
- 主进程接入 [ai-runtime](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime)（启动、依赖注入、生命周期）
- 渲染进程用 [ai-sdk-client](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client) 全面替换旧 AIService
- 移除 / 归档旧代码（[AIService](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/services/AIService.ts)、[AdapterFactory](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/services/adapters/AdapterFactory.ts)、[AiChatIpcHandler](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/handlers/ipc/AiChatIpcHandler.ts) 的 Mock 段）
- 配置迁移脚本（旧 `AIModelConfig` → dsh profile / SDK options）
- 数据迁移脚本（旧本地历史 → dsh session log；旧 chat setting → UserProfile）
- 三端 E2E 冒烟

**非范围**
- 新 UI 视觉（保留原样式；仅底层切换）
- 观测与打磨（→ [P9](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md)）

## 任务清单

### P8-1 · 主进程接入 ai-runtime

- 修改 [packages/electron/src/main.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/main.ts)（或等价入口）：
  - `app.whenReady()` 后 `await createAIRuntime({ profile: 'waifu', userDataDir })`
  - 挂载 IPC：`runtime.attach(ipcMain)`
  - `before-quit` 调用 `runtime.dispose()`
- 依赖注入实现（放在 [packages/electron/src/ai/](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai)）：
  | Seam | Electron 侧实现 | 文件 |
  |---|---|---|
  | `IKeyProvider` | `safeStorage` 加解密 | [SafeKeyProvider.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/SafeKeyProvider.ts) |
  | `IFileGateway` | `dialog + fs.promises` | [FileGateway.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/FileGateway.ts) |
  | `IClipboardGateway` | `clipboard` | [ClipboardGateway.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/ClipboardGateway.ts) |
  | `IScreenCapture` | `desktopCapturer` | [ScreenCapture.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/ScreenCapture.ts) |
  | `IHotkeyGateway` | `globalShortcut` | [HotkeyGateway.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/HotkeyGateway.ts) |
  | `IWindowGateway` | 现有窗口管理 | [WindowGateway.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/WindowGateway.ts) |
- 上述实现只做适配，不写业务；业务逻辑全在 [bundle-ig-electron-caps](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps)
- 验收：`pnpm dev:electron` 启动后日志出现 `AI runtime ready (profile=waifu)`

### P8-2 · preload 迁移

- **renderer preload**：[packages/renderer/electron/preload.ts](file:///Users/botycookie/self/ai-live2d-client/packages/renderer/electron/preload.ts)
  - 引入 `mkAiPreload('aiIPC')`
  - 保留原有 `window.electronAPI`（看板娘控制），另开 `window.aiIPC`
- **ai-chat preload**：[packages/ai-chat/electron/preload.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/electron/preload.ts)
  - 同上，`mkAiPreload('aiIPC')`
  - 移除旧 `sendAIChat` / `onAIStream` 桥接
- 验收：`window.aiIPC.invoke('ai:chat:sendMessage', ...)` 从 devtools 可用

### P8-3 · 看板娘接入（renderer）

- 修改 [packages/renderer/src/App.tsx](file:///Users/botycookie/self/ai-live2d-client/packages/renderer/src/App.tsx)：外层包 `<AIProvider profile="waifu">`
- 新组件 [WaifuAI/WaifuChat.tsx](file:///Users/botycookie/self/ai-live2d-client/packages/renderer/src/components/WaifuAI/WaifuChat.tsx)：
  - `useChat()` 收发消息
  - `useTTSLipSync()` → 传给 Live2D `setMouthOpenY`
  - `useAgent()` → 展示当前"想干什么"（可选气泡）
- 挂载 [WaifuTools](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P4-bundle-ig-live2d.md#p4-4-waifutools-面向工具集)：
  - Live2D 场景注册器：`ctx.live2d.registerSceneProvider(...)`，把当前模型、可切换动作、可用表情喂给 dsh
- 移除旧的 `waifu.tips.json` 直读逻辑，改由 `waifuTipsTool` 通过 `session:before-response` 生成
- 验收：与看板娘对话时嘴型同步、可通过对话触发换装 / 动作

### P8-4 · ai-chat 接入（chat-only 窗口）

- 修改 [packages/ai-chat/src/App.tsx](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/App.tsx)：`<AIProvider profile="chat-only">`
- 消息列表改由 `useChat({ sessionId })` 提供
- 会话侧栏：新组件 [SessionList.tsx](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/components/SessionList.tsx) 调 `client.session.list()`
- 工具面板：`client.tools.list()` 展示所有可用工具，勾选启用
- **删除**：
  - [packages/ai-chat/src/services/AIService.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/services/AIService.ts)
  - [packages/ai-chat/src/services/adapters/](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/services/adapters) 整个目录
  - [types/config.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/types/config.ts) 中的 `AIModelConfig`（改为 `ClientOptions`）
- 保留 UI 组件不动，只切数据源

### P8-5 · 旧 IPC 与 Mock 下线

- [packages/electron/src/handlers/ipc/AiChatIpcHandler.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/handlers/ipc/AiChatIpcHandler.ts)：
  - 删除所有 Mock 分支
  - 保留必要的向后兼容通道（`ai:legacy:*`），映射到 AIClient 对应方法
  - 4 周后彻底删除（在 [CHANGELOG](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md) 标注）
- [packages/electron/src/services/AdvancedTTSEngine.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/services/AdvancedTTSEngine.ts)：
  - 保留实现，但只作为 `ttsProvider('electron-native')` 的一个供应商注册到 dsh，不再从 UI 直接调用

### P8-6 · 配置迁移脚本

- 新建 [scripts/migrate-config.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-config.ts)：
  - 读旧 `userData/config.json` 中的 `AIModelConfig[]`
  - 转换为 dsh profile 中 `llm.providers[]` 结构
  - 密钥经 `safeStorage.encryptString` 写入 [userData/keys/](file:///Users/botycookie/self/ai-live2d-client/userData/keys)
  - 备份原文件为 `config.legacy.json`
- 首次启动检测并自动执行；提供 `--dry-run` 选项
- 验收：老用户升级后无感切换，聊天历史保留

### P8-7 · 数据迁移脚本

- 新建 [scripts/migrate-history.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-history.ts)：
  - 旧 `chat_history.json` → dsh `session log` schema
  - 每条 conversation 建一个 sessionId
  - 保留 `createdAt` / `updatedAt`
- 新建 [scripts/migrate-user-profile.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-user-profile.ts)：
  - 旧 chat setting 中的偏好（模型偏好、语言、TTS 音色）→ 初始 `UserProfile` 写入 [userData/memory/user_profile.json](file:///Users/botycookie/self/ai-live2d-client/userData/memory/user_profile.json)
- 单测：给定旧文件 fixture，输出 diff 与预期一致

### P8-8 · E2E 冒烟（三端 × 三 profile）

- Playwright（electron mode）用例矩阵（[e2e/](file:///Users/botycookie/self/ai-live2d-client/e2e)）：
  | # | 场景 | Profile | 断言 |
  |---|---|---|---|
  | E1 | 看板娘 hover + 语音回答 | waifu | 嘴型 rms > 0，消息出现在 session log |
  | E2 | ai-chat 发送消息 + 工具调用（读文件） | chat-only | 收到 tool result + 最终 text |
  | E3 | headless MCP：从 CLI `pnpm run mcp` 发 chat.completions | mcp-headless | stdout 返回合法 JSON |
  | E4 | 用户偏好修改后立即注入下一条 system prompt | waifu | 抓取请求 body 断言 |
  | E5 | 危险工具 `write_file` 需人工确认 | chat-only | 弹窗出现且拒绝后不执行 |
- CI：跑 E1~E4；E5 手工

### P8-9 · 文档更新

- 更新 [README.md](file:///Users/botycookie/self/ai-live2d-client/README.md)：入门 → 使用 SDK 的最小示例
- 新增 [docs/consumer-integration.md](file:///Users/botycookie/self/ai-live2d-client/docs/consumer-integration.md)：三端接入 checklist
- 更新 [docs/AI_HARNESS_DESIGN.md](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md) 变更说明段（如有偏差）

## 交付物

- 三端可用的最小可运行示例
- 旧代码归档并有向后兼容层
- 2 个数据/配置迁移脚本 + 单测
- E2E 用例矩阵（5 条）
- 用户与开发者文档更新

## 退出准则（自动化）

1. `pnpm test:e2e` 通过 E1~E4
2. `pnpm --filter @ig-live/electron dev` 启动后 `console` 无 `AIService` / `Mock` 关键字
3. 旧用户升级后 `chat_history.json` 全部条目在新 session log 中可见（脚本产出的 diff 报告为空）
4. bundle size：ai-chat renderer 主包缩小 ≥ 15%（去除 adapter 代码）
5. `pnpm typecheck` 全绿；`AIModelConfig` 全局 grep 无残留（除 `.legacy.` 文件）

## 测试策略

- **迁移脚本**：单测 + snapshot（fixture）
- **主进程接入**：Vitest + electron mock，断言 IPC handlers 数与 Facade 方法数一致
- **UI**：既有单测保留；仅替换数据源 Provider 后重跑
- **E2E**：Playwright electron + `--headed` 手工验收 waifu 视觉

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 老用户升级丢失历史 | 迁移脚本 dry-run + 备份 + 明显提示 |
| preload 两处（renderer / ai-chat）通道命名冲突 | 强制 `ai:` 前缀 + 白名单 |
| 旧 UI 组件耦合了 AIService 内部字段 | 逐个组件迁移 + `AIService` 保留一层薄 shim（1 版本后删） |
| 三端 profile 差异导致某端能力缺失 | 用 `client.getEnabledFacades()` 做能力查询，UI 灰置 |
| E2E 在 CI 上跑 Electron 不稳定 | 使用 xvfb + retry:2；waifu 视觉断言只做数值断言 |
