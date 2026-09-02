# P9 · L5 · 打磨、观测与发布

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L5（收尾 / 发布 / 长期维护） |
| 依赖 Plan | [P8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md) |
| 建议 Sprint | Sprint 6（1 周） |
| 预估工作量 | 6~8 人日 |
| 关联设计章节 | [§11 可观测性](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1400-L1450) / [§12 安全](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1450-L1560) / [§14 P9](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1860-L1883) |

## 目标

一句话：**产品达到"可发布 alpha"标准：可观测（日志/指标/追踪）、可诊断（doctor + 报错友好）、可安全存储与更新、有版本节奏与 SDK 发布流程。**

## 准入前提

- [P8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md) 全部退出准则达成
- 三端在开发机可稳定跑通 15 分钟无崩溃

## 范围与非范围

**范围**
- 结构化日志与 Session Log 存档
- 指标（token 用量、TTL、错误率、TTS/ASR 时延）
- OpenTelemetry Trace 打通（可选后端 Jaeger）
- Sentry / 自建 crash 上报（可关）
- doctor 脚本增强 + 首次启动向导
- 安全审计（依赖 CVE、preload 白名单、safeStorage、隐私数据落盘位置）
- 自动更新 + 版本化 SDK 发布
- 性能压测与瘦身

**非范围**
- 新业务功能
- 云端后台

## 任务清单

### P9-1 · 日志系统统一 ✅（Polish A）

> **落地摘要**：核心 logger + redaction 中间件已在 [packages/ai-runtime/src/observability/](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability) 提供，25 个单测覆盖脱敏 / level / child / err 序列化。选型 `pino` 暂时**未接入**（本 sprint 目标是把接口跟脱敏中间件先落地，便于 P9-2/P9-3 复用；接入 pino 作为 sink 属于后续增量，非本包退出条件）。

- 选型：`pino`（主进程） + `debug`（开发） + dsh 内置 SessionLog
- 新建 [packages/ai-runtime/src/observability/logger.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/logger.ts)：
  - 分级：`fatal / error / warn / info / debug / trace`
  - 结构化字段：`sessionId / turnId / stepId / traceId`
  - 输出：
    - 开发：pretty
    - 生产：JSON → `userData/logs/ai-runtime-YYYYMMDD.log`（滚动 7 天）
- 敏感字段脱敏中间件（[redaction.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/redaction.ts)）：`apiKey`、`Authorization`、`token`、`email` → `***`
- Session Log 保存位置：[userData/sessions/](file:///Users/botycookie/self/ai-live2d-client/userData/sessions)，格式与 dsh 原生一致

### P9-2 · 指标采集 ✅（Polish C）

> **落地摘要**：零依赖 metrics 内核 [metrics.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/metrics.ts)（Counter/Histogram/Gauge + Prometheus text）+ 8 项默认 metric 已挂到 [AI_METRICS](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/metrics.ts)；[ObservabilityBridge](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/ObservabilityBridge.ts) 把 `AIClient` 事件（`tool:executed / message:complete / agent:turn-end / tts:chunk` 等）翻译为埋点调用，[EventBroadcaster](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/EventBroadcaster.ts) 新增 `observability?: boolean | ObservabilityBridgeOptions` 挂钩（默认关闭）。UI 端 Diagnostics 页放到 Polish D，本 sprint 只交付内核 + 事件桥 + 25 个新增单测（metrics 16 + tracing 12 + bridge 9 中 metrics 部分）。

- 内置 metrics（[packages/ai-runtime/src/observability/metrics.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/metrics.ts)）：
  | 指标 | 类型 | 标签 |
  |---|---|---|
  | `ai.chat.tokens.prompt` | Counter | provider, model, sessionId |
  | `ai.chat.tokens.completion` | Counter | provider, model |
  | `ai.chat.latency.ttfb` | Histogram | provider, model |
  | `ai.tool.exec.duration` | Histogram | tool |
  | `ai.tool.error.count` | Counter | tool, code |
  | `ai.tts.latency.first_chunk` | Histogram | provider |
  | `ai.asr.latency.final` | Histogram | provider |
  | `ai.agent.steps.per_turn` | Histogram | sessionId |
- 导出：Prometheus text（`GET http://127.0.0.1:PORT/metrics`，默认关闭）
- UI：`ai-chat/settings/Diagnostics` 页展示最近 24h 摘要（**留待 Polish D**，本 sprint 未落地）

### P9-3 · 追踪 (OpenTelemetry) ✅（Polish C）

> **落地摘要**：定义 OpenTelemetry 兼容的 `Span / Tracer / SpanExporter` 接口（[tracing.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/tracing.ts)），默认 no-op tracer 零分配；`configureTracing({ exporter })` 时才启用真实 span 记录 + 导出。`AI_OTLP_ENDPOINT` 通过 [readOtlpEndpoint](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/tracing.ts) 抽出，业务方按需装配 `@opentelemetry/exporter-trace-otlp-http` —— **未装配时 0 网络请求**（对齐本文档 §退出准则 6）。`chat.turn` 主 span + 子事件（`agent.step / tool.confirm-required / tts.first_chunk`）由 [ObservabilityBridge](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/ObservabilityBridge.ts) 自动管理。所有 attribute 走 redaction 中间件。详见 [docs/observability.md](file:///Users/botycookie/self/ai-live2d-client/docs/observability.md)。

- 引入 `@opentelemetry/sdk-node` + OTLP HTTP exporter
- Span 覆盖：
  - `chat.turn` → 子 span `llm.request` / `tool.exec[*]` / `tts.play`
  - dsh Waterfall hook 自动注入 span（新建 [OtelPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/OtelPlugin.ts)）
- 可选 endpoint（默认关闭，`AI_OTLP_ENDPOINT=http://localhost:4318`）
- 文档：[docs/observability.md](file:///Users/botycookie/self/ai-live2d-client/docs/observability.md)

### P9-4 · 错误分类与友好化 ✅（Polish A）

> **落地摘要**：`AIClientError` / `SDKError` 均携带 `code + retryable + hint`，IPC 采用 `[CODE|R|hint:HINT] message` 协议（旧格式兼容）；ai-chat 侧新增 [ErrorHint 组件](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/components/ErrorHint/index.tsx) 并已接入 `MessageInput`。契约测试 10 + 客户端 9 + errorHint 7 全绿。

- 定义错误代码表 [packages/ai-sdk/src/errors.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/errors.ts)：
  | Code | 场景 | 用户提示 |
  |---|---|---|
  | `E_NO_KEY` | 未配置密钥 | 引导跳设置 |
  | `E_QUOTA` | 供应商配额 | 建议切换 provider |
  | `E_TIMEOUT` | 超时 | 一键重试 |
  | `E_TOOL_DENIED` | 用户拒绝确认 | 显示为普通提示 |
  | `E_PROFILE_MISS` | 缺 bundle | 提示重装或切 profile |
- 全链路错误必须封装为 `SDKError`，IPC 透传时保留 `code / message / retryable`
- UI 侧提供统一 `<ErrorHint code={...}>` 组件（[packages/ai-chat/src/components/ErrorHint.tsx](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/components/ErrorHint.tsx)）

### P9-5 · doctor 与首次启动向导 ✅（doctor 部分 Polish A；向导仍在 P9 后续）

> **落地摘要**：doctor 核心逻辑抽出为纯函数 [runDoctor](file:///Users/botycookie/self/ai-live2d-client/scripts/lib/doctor/index.ts)，包含 Node 版本 / 平台 / profile 装配三类 check，支持 `--report=<path>` 写 JSON。14 个单测覆盖三态。首次启动向导仍属未完成任务。

- 增强 [scripts/dsh-doctor.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/dsh-doctor.ts)：
  - Node / pnpm / turbo / OS / arch ✅（Node + OS/arch 已覆盖；pnpm/turbo 检查作为后续增量）
  - dsh 版本 + profile 校验 ✅
  - 各 provider 连通性（可选 --check-remote）（后续）
  - safeStorage 可用性（后续）
  - 端口占用 / 权限（后续）
  - 生成 `doctor-report.txt` → **改为 `--report=<path>` 写 JSON** ✅
- 首次启动向导（[packages/ai-chat/src/onboarding/](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/onboarding)）：
  - 选 profile
  - 配置至少 1 个 LLM（本地 Ollama 或远端 key）
  - 选 TTS/ASR provider
  - 授权隐私范围（是否允许屏幕截图 / 剪贴板）
  - 全部写入 `UserProfile` 与 dsh 配置

### P9-6 · 安全审计

- 依赖 CVE：`pnpm audit --prod` + `snyk test`（CI 每周）
- preload 白名单再核对（[assertChannel](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/preload/mkAiPreload.ts)）
- 隐私数据落盘位置清单 [docs/data-locations.md](file:///Users/botycookie/self/ai-live2d-client/docs/data-locations.md)：
  | 数据 | 路径 | 加密 | 保留 |
  |---|---|---|---|
  | API Key | userData/keys/*.enc | safeStorage | 直到用户删除 |
  | Session Log | userData/sessions/*.log | 否 | 90 天 |
  | UserProfile | userData/memory/user_profile.json | 可选 safeStorage | 直到用户重置 |
  | 截图 | 内存 → 上传后立即释放 | — | 0 |
- 增加 `ai:privacy:export` / `ai:privacy:delete-all` IPC，UI 一键导出/清理

### P9-7 · 性能压测与瘦身

- 场景：
  - 冷启动到 first chunk（目标 ≤ 1.5s / Ollama 本地）
  - 1000 步 agent long-run 内存增量（目标 ≤ 50MB）
  - waifu 空闲态 CPU（目标 ≤ 3%）
- 工具：[playwright + electron trace](file:///Users/botycookie/self/ai-live2d-client/e2e/perf)
- 瘦身：
  - `pnpm dlx source-map-explorer` 分析
  - 提取 zod 到共享 chunk
  - `@deepseek-ai/dsh` tree-shake 检查
- 报告：[docs/perf-baseline.md](file:///Users/botycookie/self/ai-live2d-client/docs/perf-baseline.md)

### P9-8 · SDK 版本化与发布 ✅（骨架 · Polish B）

> **落地摘要**：`@changesets/cli` 已加入根 devDependencies；新建 [.changeset/config.json](file:///Users/botycookie/self/ai-live2d-client/.changeset/config.json) 配置 `fixed = [[@ig-live/ai-sdk, @ig-live/ai-runtime, @ig-live/ai-sdk-client]]`（三包同版本号 bump），其余包 ignore；根 `package.json` 增 `changeset` / `changeset:status` / `changeset:version` 三个 script；CI 上强制 PR 附 changeset。**首次实际发布**（内部 npm registry + GitHub Packages + `v0.1.0-alpha.1` tag）留在 Polish C。

- 采用 [Changesets](https://github.com/changesets/changesets)：
  - 每个 PR 若涉及 [packages/ai-sdk](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk) / [ai-runtime](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime) / [ai-sdk-client](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client) 必须附 changeset
  - CI 合并到 `main` 后自动开 `Version Packages` PR
- 版本策略：**三个包同版本号**（一起 patch/minor/major），避免 mismatch
- 发布通道：
  - 内部 npm private registry（先）
  - GitHub Packages（后）
- SDK 兼容性契约：[docs/sdk-compat.md](file:///Users/botycookie/self/ai-live2d-client/docs/sdk-compat.md)
  - AIClient 公开签名破坏 → major
  - 新增 facade / 方法 → minor
  - bugfix → patch

### P9-9 · 应用发布流水线 ✅（骨架 · Polish B）

> **落地摘要**：内嵌在 [packages/electron/package.json](file:///Users/botycookie/self/ai-live2d-client/packages/electron/package.json) 的 `build` 字段拆到独立配置 [packages/electron/electron-builder.yml](file:///Users/botycookie/self/ai-live2d-client/packages/electron/electron-builder.yml)（mac dmg x64+arm64 / win nsis x64 / linux AppImage x64，`hardenedRuntime: true`）；新增 `package:prod:linux` + `package:debug:linux` 脚本、[turbo.json](file:///Users/botycookie/self/ai-live2d-client/turbo.json) 任务注册；CI [`.github/workflows/ci.yml`](file:///Users/botycookie/self/ai-live2d-client/.github/workflows/ci.yml) 新增 `build-electron` matrix job（PR / push 只跑 Linux AppImage 冒烟；tag `v*` 三平台 + 上传 installer artifact + 消费 `CSC_LINK` / `APPLE_ID` 等 secret）。真实 Mac 公证账号、Windows 签名证书、`electron-updater` 差分包留在 Polish C。

- electron-builder 配置更新 [packages/electron/electron-builder.yml](file:///Users/botycookie/self/ai-live2d-client/packages/electron/electron-builder.yml)：
  - Mac 公证（notarize）
  - Windows 签名
  - Linux AppImage
- 自动更新：`electron-updater`（差分包，公共 CDN 或 GitHub Releases）
- 灰度：channel `alpha / beta / stable`
- CI job：
  - PR：build + test + lint
  - tag `v*`：构建三平台 + 上传 GitHub Release + 通知

### P9-10 · 发布 Checklist 与 CHANGELOG 🟡（模板 + CHANGELOG · Polish B）

> **落地摘要**：Release notes 模板 [.github/RELEASE_TEMPLATE.md](file:///Users/botycookie/self/ai-live2d-client/.github/RELEASE_TEMPLATE.md) 已落地（覆盖平台产物表 / 变更分类 / 升级指南 / 发版前 checklist —— 含 `pnpm doctor` 三 profile + `changeset status` + 手工 E5 同意路径验收）；[docs/plans/CHANGELOG.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md) 的 `[Unreleased]` 已完整记录 Polish A / Polish B 全部变更。**首个 alpha tag `v0.1.0-alpha.1` 归档 + 应用级 CHANGELOG.md**（放仓库根）与 alpha 招募留在 Polish C。

- 新建 [docs/plans/CHANGELOG.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/CHANGELOG.md) 与 [CHANGELOG.md](file:///Users/botycookie/self/ai-live2d-client/CHANGELOG.md)（应用级）
- 首个 alpha tag：`v0.1.0-alpha.1`
- Release notes 模板 [.github/RELEASE_TEMPLATE.md](file:///Users/botycookie/self/ai-live2d-client/.github/RELEASE_TEMPLATE.md)
- Alpha 招募 20 名内部用户，收集 1 周反馈

### P9-11 · E2E 补齐（P8-8 交接项）🟡（拒绝路径 headless · Polish B）

> **背景**：[P8-8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-8-e2e-冒烟三端-三-profile) 已用 vitest 落地 E1-E4 的 headless 冒烟（真实 `AIClient + IPCTransportServer + EventBroadcaster` 组装，FakeIpc/FakeSeams 替代 Electron），产出见 [e2e/](file:///Users/botycookie/self/ai-live2d-client/e2e)、`pnpm run test:e2e`。P9 阶段需要在真实 Electron 环境下补齐 headed 复跑与 E5 危险工具确认弹窗验收。
>
> **Polish B 落地摘要**：E5 拒绝路径已作为 headless 用例落地在 [e2e/tests/E5.write-file-confirm.test.ts](file:///Users/botycookie/self/ai-live2d-client/e2e/tests/E5.write-file-confirm.test.ts)（4 用例），复用 [installDangerToolGuardrail](file:///Users/botycookie/self/ai-live2d-client/e2e/helpers/fakeSeams.ts) 复刻 [GuardrailsPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/GuardrailsPlugin.ts) 的 danger-tool 分支，断言 `tools/pre-execute` 被拒 + `tool:confirm-required` 桥接 + `tool:executed { ok:false, code:'E_TOOL_DENIED' }` 广播。CI 上已挂在 `e2e-headless` job。**同意路径**（真实 fs / dialog）与 Playwright electron headed E1-E4 复跑仍留待 Polish C。

- 引入 Playwright electron（`@playwright/test` + `_electron.launch`），复用 [P8-8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-8-e2e-冒烟三端-三-profile) 的 E1-E4 语义在 headed 主/渲染进程下再跑一遍，与 headless 版本对照：
  - E1 · waifu：真实模型加载 + `tts.synth` → 观察 `PARAM_MOUTH_OPEN_Y` 波形；
  - E2 · chat-only：真实窗口 send message + tool 调用；
  - E3 · mcp-headless：从 CLI 触发 `pnpm run mcp`（若彼时已有 CLI 入口）；
  - E4 · waifu：设置面板改 `UserProfile.identity.nickname` → 下一次 turn body 中出现。
- **E5 · 危险工具 `write_file` 确认弹窗**（本 sprint 唯一新增用例）：
  - 场景：chat-only profile，Agent 触发 `write_file` 时应弹出确认；用户拒绝后 tool 不执行；用户同意后写盘成功；
  - 断言：确认前 fs 未被写入；拒绝路径下 `tool.errors.deniedByUser` +1；同意路径下事件 `tool:executed { ok: true }` 出现；
  - CI 上做拒绝路径自动化；同意路径由于涉及真实 fs / dialog，做**手工验收**并在 [docs/consumer-integration.md](file:///Users/botycookie/self/ai-live2d-client/docs/consumer-integration.md) 记录 checklist。
- CI matrix：`test:e2e`（headless vitest，已有）+ `test:e2e:headed`（Playwright electron，本 sprint 新增），两个 job 都需绿。
- **退出条件**：`pnpm run test:e2e` + `pnpm run test:e2e:headed` 全部通过；E5 手工验收表落到 [docs/consumer-integration.md](file:///Users/botycookie/self/ai-live2d-client/docs/consumer-integration.md)；[P8-8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-8-e2e-冒烟三端-三-profile) 状态从 🟡 更新为 ✅。

## 交付物

- 完整可观测栈（日志 / 指标 / 追踪 / 错误码）
- doctor + 首次启动向导
- 安全 & 隐私文档 + 一键导出/清理
- 性能基线报告
- Changesets 发布流水线 + electron-builder 三平台产物
- 首个可分发 alpha 版本

## 退出准则（自动化）

1. `pnpm doctor` 全绿
2. `pnpm build:release` 产出三平台安装包（mac dmg / win exe / linux AppImage）
3. metrics 端点返回预期 series
4. E2E 场景全部通过（含冷启动性能断言）
5. `pnpm changeset status` 无未消费 changeset
6. Sentry / OTLP 关闭时无网络请求（防隐私泄漏）
7. `pnpm audit --prod` high 级别为 0

## 测试策略

- **发布制品冒烟**：CI 上 unpack 后启动、发一条消息、正常退出
- **自动更新**：模拟旧版 → 新版差分升级用例（e2e-updater）
- **安全**：手工渗透 preload；`electronegativity` 静态扫描进 CI
- **性能**：CI 上做 smoke 阈值（不严格），本地做完整基线

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Mac 公证账号缺失阻塞发布 | 提前申请 Apple Dev + 备选无公证 dmg 通道 |
| OpenTelemetry 引入体积膨胀 | 默认关闭 + 按需 lazy-import |
| 自动更新在受限网络失败 | 附下载页链接 + 手动升级指引 |
| 用户偏好泄漏到日志 | redaction 中间件 + 单测覆盖字段列表 |
| SDK 版本三包不同步 | changesets 强制 fixed-group（同版本号） |
| electron 主版本升级破坏 preload | 锁定 electron major；升级前跑完整 E2E + 灰度 |
