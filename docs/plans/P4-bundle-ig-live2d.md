# P4 · L0.5 · Bundle 看板娘能力（bundle-ig-live2d）

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L0.5（渲染进程 dsh bundle） |
| 依赖 Plan | [P2](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md) |
| 建议 Sprint | Sprint 2（并行） |
| 预估工作量 | 6~8 人日 |
| 关联设计章节 | [§3.0.2](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L320-L338) / [§14 P4](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1765-L1779) |

## 目标

一句话：**在渲染进程装配 `waifu` profile 时，看板娘拥有：主动搭话、触摸感知、嘴型联动、专属工具（play_motion / set_expression）与专属 agent 预设。**

## 准入前提

- [P2](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md) 完成（本 bundle 依赖 `ctx.tools / ctx.agents / ctx.userProfile`）。

## 范围

**包含**：`ctx.live2d` seam、触摸 inject、TTS 嘴型联动、waifu agent preset、waifu 专属工具。

**不包含**：Live2D 模型渲染器本身（复用现有 [renderer](file:///Users/botycookie/self/ai-live2d-client/packages/renderer)）；主进程能力（→ P3）。

## 任务清单

### P4-1 · 包骨架

- 目录 [packages/bundle-ig-live2d](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d)
- `package.json.dsh.bundle`、`peerDependencies: @ig-live/bundle-ig-base @deepseek-ai/dsh`
- 仅在渲染进程加载：`if (typeof window === 'undefined') throw`
- `waifu.yml` 追加本 bundle
- 验收：`waifu.yml` boot 后 `ctx.services` 含 `live2d`

### P4-2 · Live2dSeamPlugin

- 新建 [src/seams/live2d.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/seams/live2d.ts)：
  ```ts
  interface Live2dService {
    playMotion(group: string, index?: number): Promise<void>;
    setExpression(name: string): Promise<void>;
    driveLipSync(rms: number): void;     // 0~1
    setParameter(id: string, value: number): void;
    on(evt: 'motion:end'|'touch', fn): () => void;
  }
  ```
- 新建 [src/plugins/Live2dSeamPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/Live2dSeamPlugin.ts)：
  - `ctx.provide(Live2dKey, RendererLive2dProvider)`
  - RendererLive2dProvider 桥接 [renderer 的 Live2DModel](file:///Users/botycookie/self/ai-live2d-client/packages/renderer) 单例（用 event bus 解耦，不强绑）
- 验收：`ctx.live2d.playMotion('idle')` 触发动画

### P4-3 · TouchInjectPlugin

- 新建 [src/plugins/TouchInjectPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/TouchInjectPlugin.ts)
- 订阅 `ctx.live2d.on('touch', hitArea => ...)`
- 将 `hitArea`（e.g. `Head`, `Body`）转成 sensory part：
  ```ts
  ctx.agents.inject(sessionId, {
    type: 'sensory',
    channel: 'touch',
    data: { area: hitArea, at: Date.now() },
  });
  ```
- 冷却期：同一 area 5s 内只 inject 一次
- 验收：模拟点击 `Head` → 下一次模型请求携带 sensory part

### P4-4 · TtsLipSyncPlugin

- 新建 [src/plugins/TtsLipSyncPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/TtsLipSyncPlugin.ts)
- 订阅 P3 [TtsService](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P3-bundle-ig-electron-caps.md#p3-6-ttsplugin4-provider--ctxtts-seam) 广播的 `tts/chunk`（`rms` 字段）
- 20~30fps 用 `ctx.live2d.driveLipSync(rms)` 驱动 `ParamMouthOpenY`
- 播放结束（`tts/end`）自动归零 + `playMotion('idle')`
- 验收：合成一段音频 → 眼见嘴型开合

### P4-5 · WaifuAgentPresetPlugin + WaifuToolsPlugin

#### P4-5.1 WaifuToolsPlugin

- 新建 [src/plugins/WaifuToolsPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/WaifuToolsPlugin.ts)
- 注册两个 Tool（zod schema）：
  - `live2d_play_motion({ group, index? })`
  - `live2d_set_expression({ name })`
- 加入 [P2 GuardrailsPlugin](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P2-bundle-ig-base.md#p2-4-guardrailsplugin5-类拦截) 的 `autoConfirmTools` 白名单（无需确认）

#### P4-5.2 WaifuAgentPresetPlugin

- 新建 [src/plugins/WaifuAgentPresetPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/WaifuAgentPresetPlugin.ts)
- 通过 dsh `IsolateRealm` 定义一个 waifu 会话预设：
  - 独立 systemPrompt（读 `ctx.userProfile.preferences.tone`）
  - 只暴露 waifu 专属工具（play_motion/set_expression）+ P2 内置无害工具
  - 断开 mcp/http_get_readonly
- 预设名 `preset:waifu`；`ctx.agents.create({ preset: 'waifu' })` 即用

### P4-6 · 渲染端单测

- Vitest + jsdom + 假 canvas
- mock `RendererLive2dProvider` 断言：`playMotion` 调用、touch inject 冷却、lipsync 频率
- 覆盖率门槛：语句 ≥ 75%

## 交付物

- 1 个可发布 npm 包 [@ig-live/bundle-ig-live2d](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d)
- 1 个 seam（live2d）+ 2 个工具 + 1 个 agent preset

## 退出准则（自动化）

1. `pnpm --filter @ig-live/bundle-ig-live2d build test` 全绿
2. `waifu.yml` boot 后 `ctx.live2d.playMotion('idle')` 可跑；`ctx.tools.list()` 含两个 `live2d_*`
3. E2E fixture：模拟 tts/chunk → 驱动嘴型（用假 Live2D provider 记录调用序列）

## 测试策略

- 单元：mock live2d provider
- 集成：`waifu.yml` 全量装配跑 20 步对话，观察嘴型/表情事件序列
- 手工：搭配 [renderer](file:///Users/botycookie/self/ai-live2d-client/packages/renderer) 目视

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Live2D 模型缺少某 hitArea | plugin 用 try/catch + telemetry；不影响主流程 |
| lipsync 帧率过高导致主线程掉帧 | requestAnimationFrame + 20fps 节流 |
| touch inject 与主人机对话竞争 | 冷却 + priority 排序（sensory < user > tool） |
