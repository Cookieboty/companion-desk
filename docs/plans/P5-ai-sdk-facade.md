# P5 · L1 · ai-sdk 业务门面（环境无关）

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L1（业务门面，环境无关） |
| 依赖 Plan | [P2](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md) |
| 建议 Sprint | Sprint 2（并行） |
| 预估工作量 | 6~8 人日 |
| 关联设计章节 | [§3.1](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L471-L523) / [§14 P5](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1783-L1797) |

## 目标

一句话：**给三大消费方一个稳定 API 层——`new AIClient(ctx)` 拿到全部业务能力，屏蔽 dsh 表面变动。**

## 准入前提

- [P2](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md) 完成（`ctx.llm / tools / sessions / agents / userProfile / mcp` 就绪）。

## 范围

**包含**：AIClient 门面、6 个 Facade（Chat/Session/Tools/Memory/Asr/Tts/Live2d 共 7 个）、DTO 类型、zod 校验、单测。

**不包含**：任何 dsh 内核 / bundle 实现（→ P2/P3/P4）；IPC 与 Electron 集成（→ P6）；React Hooks（→ P7）。

## 任务清单

### P5-1 · 包骨架

- 目录 [packages/ai-sdk](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk)
- [package.json](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/package.json)：
  - `"name": "@ig-live/ai-sdk"`
  - `"peerDependencies": { "@deepseek-ai/dsh": "^0.1.2", "@ig-live/bundle-ig-base": "workspace:*" }`
  - `"dependencies": { "zod": "^3" }`
- tsup 双出 esm/cjs；`sideEffects: false`
- 验收：`pnpm build` 产出 dts + esm + cjs

### P5-2 · 业务 DTO 类型（跨端 IPC 契约）

- 目录 [src/types/](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types)
- 文件：
  - [Message.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types/Message.ts)：`Message = { id, role, parts: MessagePart[], createdAt, sessionId }`；`MessagePart` 覆盖 text/image/audio/toolCall/toolResult/sensory
  - [Session.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types/Session.ts)：`{ id, title, createdAt, meta, agentPreset? }`
  - [ToolSpec.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types/ToolSpec.ts)：`{ name, description, schema: zod.ZodType, dangerous?: boolean }`
  - [MemoryFact.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types/MemoryFact.ts)：`{ id, kind, text, source, at }`
  - [UserProfile.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types/UserProfile.ts)：**re-export from `@ig-live/bundle-ig-base`**（避免类型漂移）
  - [events.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types/events.ts)：`AIClientEvent` 枚举 + payload map（`message:delta` / `agent:step` / `tool:confirm-required` / `tts:chunk` / `userProfile:changed` ...）
- 所有 DTO 必须 **structuredClone-safe**（准备 IPC 序列化）
- 验收：`tsc --noEmit` 通过；DTO 快照测试锁字段

### P5-3 · AIClient 门面

- 新建 [src/AIClient.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/AIClient.ts)
  ```ts
  export class AIClient {
    readonly chat: ChatFacade;
    readonly sessions: SessionFacade;
    readonly tools: ToolsFacade;
    readonly memory: MemoryFacade;    // 含 userProfile.*
    readonly asr: AsrFacade;
    readonly tts: TtsFacade;
    readonly live2d: Live2dFacade;    // 仅渲染进程 profile 才可用；否则抛 NotAvailable
    constructor(private ctx: DshContext);
    on<E extends keyof AIClientEvents>(evt: E, fn): () => void;
    dispose(): Promise<void>;
  }
  ```
- 每个 Facade 内部只做**薄封装 + DTO 映射**，绝不实现业务逻辑
- 事件订阅：内部把 dsh 事件桥接为 `AIClientEvents`（`AIClient.on` 是唯一对外入口）
- 验收：类型签名评审通过；接口最小面积

### P5-4 · Facade 全量实现

- 目录 [src/facade/](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade)
  - [ChatFacade.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/ChatFacade.ts)：`sendMessage / stream / abort / regenerate`
  - [SessionFacade.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/SessionFacade.ts)：`list / get / create / fork / rename / delete`
  - [ToolsFacade.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/ToolsFacade.ts)：`list / register(local) / setEnabled / confirm(reqId, ok)`
  - [MemoryFacade.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/MemoryFacade.ts)：`facts.list/put/delete`、`summaries.get(sessionId)`、`userProfile.{get,set,reset,subscribe,export,import}`
  - [AsrFacade.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/AsrFacade.ts) / [TtsFacade.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/TtsFacade.ts)：`list / synth / transcribe / stream / stop`
  - [Live2dFacade.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/Live2dFacade.ts)：`playMotion / setExpression / driveLipSync / on('motion:end'|'touch')`
- 每个 Facade 必须导出 **接口类型** 供 [P7 ClientAIClient](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P7-ai-sdk-client.md#p7-2-clientaiclientipc-proxy) 保持签名一致

### P5-5 · Config 与 zod 校验

- 新建 [src/config/AppConfig.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/config/AppConfig.ts)：业务配置类型（provider 选择 / 默认模型 / 快捷键 / UI 偏好）
- 新建 [src/config/validators.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/config/validators.ts)：`AppConfigSchema = z.object({...}).strict()`
- 加载入口：`loadAppConfig(raw): AppConfig`——失败时把 zod issue 转成用户可读的错误
- 单测：正/负样本各 10 条

### P5-6 · DI 与日志

- 新建 [src/di/ILogger.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/di/ILogger.ts)：`{ debug/info/warn/error }`
- `AIClient` 构造第二参数 `{ logger?: ILogger }`；默认 no-op
- 其余 DI（KeyStore/Storage）通过 dsh ctx seam 拿，不在 SDK 里定义

### P5-7 · 集成测试

- 用 dsh testing utility 装配 mock ctx（挂 P2 内存版 bundle）
- 场景：
  1. `chat.stream()` 端到端返回 chunks
  2. `chat.abort()` 立即停
  3. `memory.userProfile.set({preferences:{tone:'cute'}})` → 下一次 `chat.stream()` 的 systemPrompt 出现 tone
  4. `tools.confirm(reqId, false)` → 危险工具被拒
- 覆盖率门槛：语句 ≥ 85%

## 交付物

- 1 个可发布 npm 包 [@ig-live/ai-sdk](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk)
- 7 个 Facade + AIClient + 完整 DTO + zod 校验器

## 退出准则（自动化）

1. `pnpm --filter @ig-live/ai-sdk build test lint typecheck` 全绿
2. 覆盖率 ≥ 85%
3. `new AIClient(ctx).chat.stream(...)` 集成测试通过
4. `AIClient` 类型签名快照评审通过并锁定

## 测试策略

- 单元：每个 Facade mock ctx
- 集成：完整装配跑 4 场景
- 契约：DTO 快照锁定 IPC 契约

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| dsh 表面 API 变动 | Facade 内部收敛所有 `ctx.use()` 调用 |
| DTO 与 IPC 序列化不兼容 | structuredClone-safe 单测 |
| Live2dFacade 在非渲染进程被误用 | 构造时探测 → 抛 `LIVE2D_NOT_AVAILABLE` |
