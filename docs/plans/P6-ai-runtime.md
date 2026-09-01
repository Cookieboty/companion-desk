# P6 · L2 · ai-runtime 主进程运行时

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L2（Electron 主进程运行时） |
| 依赖 Plan | [P3](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P3-bundle-ig-electron-caps.md) + [P5](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P5-ai-sdk-facade.md) |
| 建议 Sprint | Sprint 3（1 周） |
| 预估工作量 | 4~6 人日 |
| 关联设计章节 | [§3.2](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L525-L555) / [§14 P6](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1801-L1816) |

## 目标

一句话：**在 Electron 主进程里 `boot('waifu')`，把 AIClient 通过 IPC 桥给所有渲染窗口，广播事件；替换旧 [AiChatIpcHandler](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/handlers/ipc/AiChatIpcHandler.ts) 但保留兼容通道。**

## 准入前提

- [P3](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P3-bundle-ig-electron-caps.md) 完成（Electron seam 就绪）
- [P5](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P5-ai-sdk-facade.md) 完成（AIClient 稳定）

## 范围

**包含**：AIRuntimeService、IPCTransportServer（反射自动挂通道）、EventBroadcaster、兼容适配层、集成测试。

**不包含**：渲染进程客户端（→ P7）；业务 UI（→ P8）。

## 任务清单

### P6-1 · 包骨架

- 目录 [packages/ai-runtime](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime)
- `package.json`：
  - `peerDependencies: electron @ig-live/ai-sdk @ig-live/bundle-ig-base @ig-live/bundle-ig-electron-caps @deepseek-ai/dsh`
  - 仅 CJS 输出（Electron main 兼容性）
- 顶部断言：`if (process.type !== 'browser') throw`
- 验收：`pnpm build` 通过

### P6-2 · AIRuntimeService（生命周期）

- 新建 [src/AIRuntimeService.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/AIRuntimeService.ts)：
  ```ts
  export class AIRuntimeService {
    private client?: AIClient;
    async start(profile: string, opts: { home: string }): Promise<AIClient>;
    stop(): Promise<void>;
    get client(): AIClient;              // 未 start 则抛
  }
  ```
- 内部：`boot(profile)` → 构造 `new AIClient(ctx, { logger })` → 打日志 `dsh booted (<profile>)`
- 挂 `app.on('before-quit', () => runtime.stop())`
- 全局单例导出：`export const runtime = new AIRuntimeService()`
- 验收：`await runtime.start('waifu', {home})` 返回 AIClient

### P6-3 · IPCTransportServer（自动反射挂通道）

- 新建 [src/IPCTransportServer.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/IPCTransportServer.ts)：
  - 输入：AIClient 与通道前缀 `ai`
  - 反射策略：对每个 Facade 遍历方法名 → 挂 `ipcMain.handle(`${prefix}:${facade}:${method}`, async (e, ...args) => client[facade][method](...args))`
  - 流式方法（返回 `AsyncIterable`）走事件通道：`sender.send(`${prefix}:${facade}:${method}:chunk`, chunk)`；订阅端用 `reqId` 关联
  - 权限：白名单发起窗口（waifu / ai-chat 已注册）
  - 抛异常时通过 `throw` 传回渲染层（Electron 会序列化）
- 单元测试：mock `ipcMain` 验证注册数量 & 参数透传
- 验收：`ai:chat:sendMessage` 通道存在且工作

### P6-4 · EventBroadcaster

- 新建 [src/EventBroadcaster.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/EventBroadcaster.ts)：
  - 订阅 `AIClient.on('*')` → 用 `webContents.getAllWebContents()` 广播 `ai:event`（payload: `{ evt, data }`）
  - 支持"按窗口订阅子集"（渲染层 send `ai:event:subscribe` 携带过滤器）
  - 生命周期：`start(client)` / `stop()`
- 验收：多窗口场景中，`chat.stream` 的 chunk 在所有窗口都能收到

### P6-5 · Electron 能力 IPC handler

- 新建 [src/handlers/](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/handlers)：把 P3 的 seam 也挂通道
  - `ai:screen:capture` / `ai:clipboard:read/write` / `ai:keyStore:*`
- 大对象（截屏 buffer）走 `MessagePort` 而不是 `ipc.send`（避免拷贝）
- 验收：渲染层能拿到 capture buffer

### P6-6 · 与旧 AiChatIpcHandler 的兼容适配

- 新建 [src/legacy/AiChatCompat.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/legacy/AiChatCompat.ts)：
  - 保留旧通道名（如 `ai-chat:send-message`）
  - 内部转发到新 AIClient
  - 打 deprecation warning（`console.warn` + telemetry 计数）
  - 计划保留 2 个次版本；文档写清弃用节奏
- 逐通道 mapping 表放 [docs/legacy-channel-mapping.md](file:///Users/botycookie/self/ai-live2d-client/docs/legacy-channel-mapping.md)

### P6-7 · 集成测试（playwright-electron）

- 场景：
  1. 启动 → 主进程日志出现 `dsh booted (waifu)`
  2. 渲染层调 `ai:chat:sendMessage` → 收到流式 chunk
  3. `ai:userProfile:set` → 触发 `ai:event`（`userProfile:changed`）
  4. 旧 `ai-chat:send-message` 通道仍可用（打 warning）
- 归入 CI `test:e2e`（macos + windows）

## 交付物

- 1 个可发布 npm 包 [@ig-live/ai-runtime](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime)
- IPCTransportServer + EventBroadcaster + 兼容层
- Legacy channel mapping 文档

## 退出准则（自动化）

1. `pnpm --filter @ig-live/ai-runtime build test` 全绿
2. Electron 集成测试 4 场景通过（macos + windows）
3. 主进程日志能看到 `dsh booted (<profile>)` 与通道注册数
4. 旧通道 → 新 AIClient 兼容层的每条 mapping 均有集成测试

## 测试策略

- 单元：mock `ipcMain / webContents`
- 集成：playwright-electron
- 契约：IPC 通道快照锁（包含通道名 + 参数 schema）

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 反射式挂通道漏方法 | 编译期从 Facade 类型生成 `channels.ts`（ts-morph），运行时断言与预期一致 |
| 大对象 IPC 卡顿 | 用 MessagePort 传 buffer |
| 旧兼容层永久留存 | 强制 telemetry + 版本里程碑（v0.3 起移除） |
