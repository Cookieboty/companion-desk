# P2 · L0.5 · Bundle 通用能力（bundle-ig-base）

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L0.5（跨环境 dsh bundle） |
| 依赖 Plan | [P1](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P1-dsh-kernel-adoption.md) |
| 建议 Sprint | Sprint 1（1~2 周） |
| 预估工作量 | 8~12 人日 |
| 关联设计章节 | [§3.0.1](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L300-L318) / [§6.3.1](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1255-L1397) / [§14 P2](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1726-L1742) |

## 目标

一句话：**交付 [bundle-ig-base](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base)——把 LLM Provider、内置工具、护栏、MCP 桥接、4 层记忆（含用户偏好薄层）全部注册到 dsh 生态，让任意 profile 只要挂上这个 bundle 就能获得完整的"跨环境通用 AI 能力"。**

## 准入前提

- P1 全部退出准则达成（`pnpm doctor waifu` 可跑通）。

## 范围

**包含**（跨 Node/Renderer 环境通用）：
- 8 个 LLM Provider（OpenAI / DeepSeek / Ollama / llama.cpp / Claude / Gemini / Qwen / Doubao）
- 4 个内置 Tool（time_now / random / echo / http_get_readonly）
- Guardrails 5 类拦截
- MCP 桥接（`ctx.mcp` seam）
- MemoryPolicy（L2 摘要 + L4 facts 注入）
- **用户偏好薄层记忆**（L3，5 插件 + 1 seam）

**不包含**：Electron 主进程能力（→ P3）；Live2D（→ P4）；SDK 门面（→ P5）。

## 任务清单

### P2-1 · 包骨架

- 从 [templates/pkg-template](file:///Users/botycookie/self/ai-live2d-client/templates/pkg-template) 复制到 [packages/bundle-ig-base](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base)
- [package.json](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/package.json)：
  ```jsonc
  {
    "name": "@ig-live/bundle-ig-base",
    "type": "module",
    "main": "./dist/index.js",
    "exports": {
      ".":         "./dist/index.js",
      "./patch":   "./dist/patch.yml"
    },
    "dsh": { "bundle": "./dist/patch.yml" },
    "peerDependencies": { "@deepseek-ai/dsh": "^0.1.2" },
    "dependencies":     { "zod": "^3", "yaml": "^2" }
  }
  ```
- [src/index.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/index.ts)：`export default definePlugin({ name, apply(ctx) { ... } })`
- [src/patch.yml](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/patch.yml)：默认 row id + config
- 验收：加入 `waifu.yml` 后 `pnpm doctor waifu` 打印本 bundle 名

### P2-2 · LLMProvidersPlugin（8 个 provider）

- 目录 [src/plugins/llm/](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/llm)
- 抽 [BaseOpenAICompat.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/llm/BaseOpenAICompat.ts)：request builder / SSE 流式解析 / tool_call 结构映射 / usage 归一
- 每个 provider 一文件：`OpenAIProvider.ts / DeepSeekProvider.ts / OllamaProvider.ts / LlamaCppProvider.ts / ClaudeProvider.ts / GeminiProvider.ts / QwenProvider.ts / DoubaoProvider.ts`
- [LLMProvidersPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/LLMProvidersPlugin.ts)：`ctx.llm.register(id, adapter)` × 8
- 每个 provider 必须实现：`chat(request): Promise<Response>`、`stream(request): AsyncIterable<Chunk>`、`abort(reqId)`
- 参数映射表放 [docs/provider-compat.md](file:///Users/botycookie/self/ai-live2d-client/docs/provider-compat.md)
- 验收：对每个 provider 跑 mock server 单测 `chat/stream/abort` 三件套

### P2-3 · ToolsBuiltinPlugin（4 个内置工具）

- 目录 [src/plugins/tools/builtin/](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/tools/builtin)
- [time_now.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/tools/builtin/time_now.ts)：`{ tz?: string }` → ISO 字符串
- [random.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/tools/builtin/random.ts)：`{ min, max, integer? }`
- [echo.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/tools/builtin/echo.ts)：`{ text }` → `text`
- [http_get_readonly.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/tools/builtin/http_get_readonly.ts)：白名单域名 + `Content-Length` 上限 + 只允许 GET
- 每个工具**必须带 zod schema**，schema 自动进入 systemPrompt
- 验收：`ctx.tools.list().length >= 4`；单测覆盖参数校验错误路径

### P2-4 · GuardrailsPlugin（5 类拦截）

- [src/plugins/GuardrailsPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/GuardrailsPlugin.ts)：注册 dsh waterfall
  | 规则 | 挂点 | 触发 |
  |---|---|---|
  | ToolWhitelist | `tools/pre-execute` | 未授权 → reject |
  | RateLimit | `tools/pre-execute` | tokenBucket，每分钟 N 次 |
  | DangerConfirm | `tools/pre-execute` | 破坏性工具 → 需 UI 确认（写事件 `tool/confirm-required`） |
  | RepeatCall | `tools/pre-execute` | 同 tool+相同 args 连 3 次 → reject |
  | Timeout | `tools/wrap` | Promise.race 超时中断 |
- 配置从 `patch.id: guardrails.default` 读取
- 验收：单测覆盖 5 类拦截各自的通过/拦截路径

### P2-5 · MCP 桥接（seams/mcp.ts）

- [src/seams/mcp.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/seams/mcp.ts)：`defineService<McpService>('ctx.mcp')`
  ```ts
  interface McpService {
    listServers(): McpServerInfo[];
    connect(cfg: McpServerConfig): Promise<McpConnection>;
    disconnect(id: string): Promise<void>;
    on(evt: 'server:up'|'server:down', fn): () => void;
  }
  ```
- [src/plugins/McpBridgePlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/McpBridgePlugin.ts)：
  - 依赖 `@modelcontextprotocol/sdk`（peer）
  - `ctx.provide(McpKey, impl)`
  - 桥接：MCP tool → 注册进 `ctx.tools`，前缀 `mcp:<server>:<tool>`
  - MCP prompt → 追加进 `ctx.systemPrompt`
- 验收：起一个 mock MCP server → 桥接后 `ctx.tools.list()` 包含 mcp: 前缀条目

### P2-6 · MemoryPolicyPlugin（L2 + L4 + L3 编排入口）

- [src/plugins/MemoryPolicyPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/MemoryPolicyPlugin.ts)：
  - 订阅 `agent/pre-request`（waterfall）→ 组装 systemPrompt sections：
    1. `[Identity]`（来自 UserProfile.identity）
    2. `[User Preferences]`（来自 UserProfile.preferences + habits，见 P2-7）
    3. `[Long-term Facts]`（来自 `memory/facts.json`）
    4. `[Session Summary]`（来自 dsh 每 5 步生成的总结）
  - **总 token 上限 400**，超过按"身份 > 偏好 > facts > 摘要"顺序截断
  - 拦截 `agent/post-final` → 每 5 步触发 summary
- 单元：mock ctx + fixture profile，断言注入顺序与截断
- 验收：跑 20 轮对话，systemPrompt 稳定 < 400 tokens

### P2-7 · 用户偏好薄层记忆（L3）—— 5 插件 + 1 seam

> 对齐 [§6.3.1](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1255-L1397)

- 目录 [src/plugins/preference/](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference)

#### P2-7.1 UserProfile 类型 + zod schema

- 新建 [src/types/UserProfile.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/types/UserProfile.ts) —— 严格对齐 §6.3.1 (1) 的 interface
- 新建 [src/types/UserProfileSchema.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/types/UserProfileSchema.ts) —— zod 校验（`.strict()` 拒未知字段）

#### P2-7.2 UserProfileStorePlugin + seam

- 新建 [src/seams/userProfile.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/seams/userProfile.ts)：`UserProfileService` 接口（get/set/reset/subscribe/export/import）
- 新建 [src/plugins/preference/UserProfileStorePlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/UserProfileStorePlugin.ts)：
  - `ctx.provide(UserProfileKey, impl)`
  - 读写走注入的 `IProfileStorage`（默认 InMemory；文件版由 P3 [FileSessionStorePlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/FileSessionStorePlugin.ts) 覆盖）
  - 读时执行 `migrate()`；写时 deep-merge + zod 校验 + emit `userProfile/changed`

#### P2-7.3 PreferenceExtractor（规则中间件）

- 新建 [src/plugins/preference/PreferenceExtractor.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/PreferenceExtractor.ts)：
  - 订阅 `session/user-message`
  - 规则表放 [src/plugins/preference/rules.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/rules.ts)：
    | 正则 | patch |
    |---|---|
    | `/回答简短|别啰嗦/` | `preferences.replyStyle = 'concise'` |
    | `/说中文\|用中文回复/` | `preferences.replyLanguage = 'zh-CN'` |
    | `/我(更)?(?:喜欢\|习惯)(React\|Vue\|TypeScript\|Python)/` | 追加到 codeStyle.framework/language |
    | `/(可爱\|温柔\|正式\|严肃)一?点/` | 设置 tone |
    | `/别用\|讨厌\|不(?:喜欢\|用)\s*(\w+)/` | dislikes += m[1] |
  - `patch.source = 'inferred'`
- 单测：至少 20 条 fixture 覆盖每条规则的正/负样本

#### P2-7.4 PreferenceDistiller（LLM 蒸馏）

- 新建 [src/plugins/preference/PreferenceDistiller.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/PreferenceDistiller.ts)：
  - 触发时机：每 N 轮（默认 20） 或 `session/closed`
  - 用 `ctx.llm` 的**小模型 slot**（`patch.id: llm.distill`）
  - 严格 JSON schema 输出（用 `response_format: json_schema` 或 tool_call 强制）
  - 只允许更新 `preferences.*` 与 `dislikes`，禁止改 `identity`
  - 幂等：同 sessionId 24h 内不重复蒸馏
- 单测：mock LLM 返回非法 JSON → 拒绝写入且写 log

#### P2-7.5 HabitStatCollector（隐式统计）

- 新建 [src/plugins/preference/HabitStatCollector.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/HabitStatCollector.ts)：
  - 订阅事件与更新字段：
    | 事件 | 更新 |
    |---|---|
    | `session/user-message` | `activeHours[hour]++` |
    | `agent/turn-end` | `avgSessionLen` EMA |
    | `agent/stopped-by-user` | `stopGenerationRate` EMA |
    | `agent/regenerate` | `regenRate` EMA |
    | `tools/post-execute` | `topTools[tool]++` |
    | `session/user-message` + NER | `topTopics` top-k |
  - 每 60s 批量落盘（防抖）

#### P2-7.6 migrate.ts

- 新建 [src/plugins/preference/migrate.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/migrate.ts)：`migrate(json, from, to)`；预留 v1→v2 空实现

#### P2-7.7 只读工具挂载

- [src/plugins/preference/PreferenceToolsPlugin.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/PreferenceToolsPlugin.ts)：
  - `user_profile_read({ path? })` → 只读
  - `user_profile_suggest_update({ patch, reason })` → 触发 `tool/confirm-required` 事件，需 UI 二次确认

### P2-8 · 单元测试与覆盖

- Vitest + dsh 测试工具装配 mock ctx
- 单包覆盖率门槛：**语句 ≥ 80% / 分支 ≥ 70%**
- 关键契约测试放 [tests/contracts/](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/tests/contracts)：LLM provider 8 家 stream 断言一致性

## 交付物

- 1 个可发布 npm 包 [@ig-live/bundle-ig-base](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base)
- `waifu.yml` 追加本 bundle 后：`ctx.llm.list().length === 8` / `ctx.tools.list().length ≥ 6` / `ctx.mcp` / `ctx.userProfile` 均可用
- 至少 60 条单测，覆盖率达门槛

## 退出准则（自动化）

1. `pnpm --filter @ig-live/bundle-ig-base build test lint typecheck` 全绿
2. `pnpm doctor waifu` 输出中 `services` 含 `llm/tools/mcp/userProfile`
3. 契约测试对 8 家 provider 的 mock server 全绿
4. `ctx.userProfile.get()` 返回 zod 合法的默认 profile

## 测试策略

- 单元：每个插件独立 spec；zod schema 边界值
- 契约：LLM provider 一致性
- 集成：`boot('mcp-headless')` + 完整跑通"消息 → 工具 → 偏好写入 → 下轮 systemPrompt 中出现新偏好"

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 各家 LLM API 频繁变更 | BaseOpenAICompat 归一化 + provider 独立单测；测试连接工具兜底 |
| 偏好被 prompt-injection 污染 | LLM 只读；PreferenceDistiller 严格 JSON schema；写入永远走中间件/UI |
| 蒸馏 LLM 成本 | 默认关闭；用户在 UI 里开启后才走；用小模型 |
| MCP SDK 破坏性升级 | peer 依赖 + 版本 range 收紧 |
