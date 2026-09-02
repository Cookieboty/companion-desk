# Changelog

> 本 changelog 记录 dsh 迁移过程中影响**外部消费方**的 API / 通道 / 数据结构变更。
> 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 精神，版本号由主仓 `package.json` 与各 workspace 包各自维护。
>
> 迁移背景与整体路线：[docs/plans/README.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/README.md)。

## [Unreleased]

### Added
- **P9-11 · Playwright Headed E2E 复跑（Polish C 主体完成）**（[P9-11](file:///d:/self_git/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-11-e2e-补齐p8-8-交接项)）：
  - 引入 [@playwright/test](https://playwright.dev/) + `_electron.launch`，在真实 Electron 主/渲染进程复跑 E1-E4，连续两轮全绿 —— `6 passed (4.1s)`（E1 tts-rms 601-639ms · E1 agent/turn-end 广播 595-607ms · E2 aiIPC.invoke tools/list 571-610ms · E2 tool:executed 广播 591-597ms · E3 --no-window AIRuntime 344-345ms · E4 userProfile:set 广播 616-644ms）；同轮 headless `pnpm run test:e2e` 未回归（5 files / 15 tests / 2.52s）。
  - 新增骨架：[playwright.config.ts](file:///d:/self_git/ai-live2d-client/playwright.config.ts)（testDir=`e2e-headed`，timeout 60s，reporter=list+html，trace/video/screenshot on-failure）、[e2e-headed/](file:///d:/self_git/ai-live2d-client/e2e-headed) 目录（`fixtures/electronApp.ts` + `harness/{main.cjs,preload.cjs,renderer.html}` + `tests/E{1..4}.*.headed.spec.ts`）、根 [package.json](file:///d:/self_git/ai-live2d-client/package.json) 增补 `test:e2e:headed` 脚本、[.gitignore](file:///d:/self_git/ai-live2d-client/.gitignore) 忽略 `playwright-report/` 与 `test-results/`。
  - Fixture 侧显式解析 [packages/electron/node_modules/electron](file:///d:/self_git/ai-live2d-client/packages/electron/node_modules/electron) 的 Electron 可执行文件，规避 Playwright 自带 sandbox 下载失败；main.cjs 侧 `disableHardwareAcceleration()` + `userData` 重定向到项目内 `.tmp/e2e-userdata`，规避 sandbox 对系统色彩配置 / NVIDIA 目录的访问。
  - 包侧配合：[bundle-ig-electron-caps/package.json](file:///d:/self_git/ai-live2d-client/packages/bundle-ig-electron-caps/package.json) 与 [bundle-ig-live2d/package.json](file:///d:/self_git/ai-live2d-client/packages/bundle-ig-live2d/package.json) 的 `./seams` 补 `require` 出口；[bundle-ig-live2d/tsup.config.ts](file:///d:/self_git/ai-live2d-client/packages/bundle-ig-live2d/tsup.config.ts) 拆 main(ESM) + seams(ESM+CJS)，供主进程 CJS 直 require。此为纯外向能力扩展，未破坏既有 ESM 消费者。
  - 关键修复：`FakeBooter` context 补 `ctx.inject`（`AIClient.bindDshBridges` 需要）；`createElectronIpcAdapter` 的 `eval('require')` 在 Electron sandbox 里失败 → 主进程侧改用直接 `ipcMain` / `webContents` 手搓 adapter；`UserProfileService.set/reset/import` 从 `ctx.triggerEvent` 改为 `ctx.runHooks('userProfile/changed', …)`，对齐 `AIClient` 的 hook 订阅路径，`userProfile:changed` 广播才能真正到达 renderer。
  - **仍留待收尾**：CI matrix 挂 `test:e2e:headed` job（`.github/workflows/ci.yml`，Linux 侧 `xvfb-run` + windows-latest runner 双 matrix，与 `test:e2e` headless job 并联作为绿门槛）、E5 同意路径手工验收 checklist（真实 fs / dialog / `tool:executed { ok:true }`）落到 [docs/consumer-integration.md](file:///d:/self_git/ai-live2d-client/docs/consumer-integration.md)、[P8-8](file:///d:/self_git/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-8-e2e-冒烟三端-三-profile) 状态最终 ✅。
- **P9-11 · Headless E2E 复跑基线（Polish B 收尾）**（[P9-11](file:///d:/self_git/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-11-e2e-补齐p8-8-交接项)）：
  - 复跑 `pnpm run test:e2e` 两轮全绿 —— `Test Files 5 passed (5) / Tests 15 passed (15)`，单轮 Duration `~1.5s`（E1 4ms · E2 5ms · E3 710-742ms · E4 11-20ms · E5 5ms），作为 P8 → P9 headless 冒烟基线；
  - 附带修复 [E3.mcp-headless-profile.test.ts](file:///d:/self_git/ai-live2d-client/e2e/tests/E3.mcp-headless-profile.test.ts#L52-L58) 的 `execFileSync('pnpm', ..., { shell: true })`，让 Windows 上的 `pnpm.CMD` 走 `PATHEXT` 解析（原写法在 Windows 上 spawnSync `ENOENT`；Linux/macOS 加 `shell: true` 后行为不变）；
  - [P8-consumer-migration.md#P8-8](file:///d:/self_git/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-8-e2e-冒烟三端-三-profile) 从 🟡 收成 ✅（含 E5），进度表同步刷新至 5 文件 · 15 test；
  - Playwright headed E1-E4 复跑与 E5 同意路径手工验收仍延至 Polish C。
- **P9 · 打磨包 C（观测补齐 · Metrics + Tracing）**：
  - **P9-2 · 零依赖 metrics 内核**（[P9-2](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-2-指标采集)）：
    - 新增 [packages/ai-runtime/src/observability/metrics.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/metrics.ts) —— `Counter / Histogram / Gauge` + `MetricsRegistry`；单一进程内 `defaultRegistry`；`snapshot()` 供 UI/诊断消费，`toPrometheus()` 输出标准 Prometheus text（含 `_bucket{le="+Inf"} / _sum / _count`）；
    - 内置 8 项默认 metric（`ai_chat_tokens_prompt / _completion / ai_chat_latency_ttfb_ms / ai_tool_exec_duration_ms / ai_tool_error_count / ai_tts_latency_first_chunk_ms / ai_asr_latency_final_ms / ai_agent_steps_per_turn`），全部对齐 [P9-2 计划表](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-2-指标采集)；
    - 单测 [metrics.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/tests/observability/metrics.test.ts) 16 用例覆盖 label 组合、histogram bucket 累计、`+Inf` 落桶、Prometheus 文本格式、`snapshot` 稳态。
  - **P9-3 · OpenTelemetry 兼容 tracer**（[P9-3](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-3-追踪-opentelemetry)）：
    - 新增 [packages/ai-runtime/src/observability/tracing.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/tracing.ts) —— OTel 同义的 `SpanKind / SpanStatusCode / SpanContext / Span / Tracer / SpanExporter` 接口；默认 `NOOP_TRACER` 零分配、无副作用；`configureTracing({ exporter })` 才启用真实 span 记录；`InMemorySpanRecorder` 供测试消费；attribute 走 [redaction 中间件](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/redaction.ts) 自动脱敏；
    - `AI_OTLP_ENDPOINT` 环境变量由 [readOtlpEndpoint()](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/tracing.ts) 抽出；ai-runtime 内核**不直接依赖** `@opentelemetry/*`，业务方自行装配 exporter → 未装配时 0 网络请求（对齐 P9 §退出准则 6）；
    - 单测 [tracing.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/tests/observability/tracing.test.ts) 12 用例覆盖 no-op 幂等性、span 父子链、attributes/events 脱敏、`recordException` 状态、exporter 调用契约、`AI_OTLP_ENDPOINT` 解析。
  - **ObservabilityBridge · 事件到埋点的翻译层**：
    - 新增 [packages/ai-runtime/src/ObservabilityBridge.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/ObservabilityBridge.ts)，把 `AIClient` 事件（`agent:step / agent:turn-end / agent:stopped-by-user / message:complete / tool:executed / tool:confirm-required / tts:chunk`）翻译为 metrics observe + tracing span 生命周期管理；单个 `chat.turn` span 覆盖整轮，`tool:executed { error:'[E_XXX|...]' }` 自动解出 `code` 落到 `ai_tool_error_count`；
    - 修改 [packages/ai-runtime/src/EventBroadcaster.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/EventBroadcaster.ts)：新增 `observability?: boolean | ObservabilityBridge | ObservabilityBridgeOptions` 挂钩（默认关闭），bridge 在广播 `webContents.send` **之后**串行触发，不阻塞 IPC；
    - 集成测试 [ObservabilityBridge.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/tests/ObservabilityBridge.test.ts) 9 用例覆盖 tokens/latency/tool-duration/tool-error-code 抽取/turn 结束的 histogram 记录 & span 关闭/stop-by-user 分支/observability=false 时无副作用。
  - **文档**：新增 [docs/observability.md](file:///Users/botycookie/self/ai-live2d-client/docs/observability.md) —— 覆盖日志/脱敏/指标/追踪四段全景、事件桥接翻译规则、OTLP 装配示例；[P9-polish-observability-release.md](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md) P9-2/P9-3 标记 ✅（Polish C），UI Diagnostics 页显式延后到 Polish D。
- **P9 · 打磨包 B（CI / 打包骨架 / E2E 收尾 / Changesets）**：
  - **P9-11 · E5 · 危险工具 `write_file` 拒绝路径（headless）**（[P9-11](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-11-e2e-补齐p8-8-交接项)）：
    - 新增 [e2e/tests/E5.write-file-confirm.test.ts](file:///Users/botycookie/self/ai-live2d-client/e2e/tests/E5.write-file-confirm.test.ts)，覆盖 4 个断言 —— `client.tools.list()` 危险标记、`tools/pre-execute` 被拒并抛 `E_TOOL_DENIED`、AIClient 侧收到 `tool:confirm-required` 桥接事件、拒绝路径下 `tools/post-execute { ok:false, code:'E_TOOL_DENIED' }` 广播为 `tool:executed`；
    - 在 [e2e/helpers/fakeSeams.ts](file:///Users/botycookie/self/ai-live2d-client/e2e/helpers/fakeSeams.ts) 抽出 `createWriteFileTool()` + `installDangerToolGuardrail(ctx, dangerTools)`（复刻 [GuardrailsPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/GuardrailsPlugin.ts) 的 danger-tool 分支）；
    - **同意路径**（涉及真实 fs / dialog）仍留在 [P9-11 手工验收清单](file:///Users/botycookie/self/ai-live2d-client/docs/consumer-integration.md)。
  - **P9-8 · Changesets 骨架**（[P9-8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-8-sdk-版本化与发布)）：
    - 引入 `@changesets/cli` 到根 `devDependencies`；新增 [.changeset/config.json](file:///Users/botycookie/self/ai-live2d-client/.changeset/config.json) —— `fixed = [[ai-sdk, ai-runtime, ai-sdk-client]]`（三包必须同版本号 bump），其余包 ignore；`privatePackages.version = true` 让 changesets 在私包状态下也维护版本；
    - 根 `package.json` 新增 `changeset` / `changeset:status` / `changeset:version` 三个 script；
    - 新增 [.changeset/README.md](file:///Users/botycookie/self/ai-live2d-client/.changeset/README.md) 说明日常流程；
    - CI 上新增 `changeset status` job（仅 PR），强制 fixed-group 变更必须附 changeset。
  - **P9-9 · electron-builder 独立配置 + Linux AppImage 目标**（[P9-9](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-9-应用发布流水线)）：
    - 新增 [packages/electron/electron-builder.yml](file:///Users/botycookie/self/ai-live2d-client/packages/electron/electron-builder.yml)：mac dmg (x64+arm64) / win nsis (x64) / linux AppImage (x64) 三 target，`hardenedRuntime=true`，签名/公证通过 `CSC_LINK` + `APPLE_ID` 环境变量骨架启用（未注入时 electron-builder 自动降级不签名）；
    - 从 [packages/electron/package.json](file:///Users/botycookie/self/ai-live2d-client/packages/electron/package.json) 移除内嵌 `build` 字段；新增 `package:prod:linux` / `package:debug:linux` 脚本；
    - 根 [package.json](file:///Users/botycookie/self/ai-live2d-client/package.json) 与 [turbo.json](file:///Users/botycookie/self/ai-live2d-client/turbo.json) 注册 Linux 转发任务。
  - **CI workflow 扩展**（[.github/workflows/ci.yml](file:///Users/botycookie/self/ai-live2d-client/.github/workflows/ci.yml)）：
    - 新增 `e2e-headless` job：Ubuntu 上跑 `pnpm test:e2e`（E1..E5 共 15 用例）；
    - 新增 `changeset` job：PR 强制 `changeset status`；
    - 新增 `build-electron` matrix job：PR / push 只跑 ubuntu-latest AppImage 冒烟（快而免凭证），tag `v*` 三平台矩阵 + 上传 installer artifact + 消费签名/公证 secret；
    - `on.push.tags: ['v*']` 触发发版 pipeline。
  - **P9-10 · Release Notes 模板**（[.github/RELEASE_TEMPLATE.md](file:///Users/botycookie/self/ai-live2d-client/.github/RELEASE_TEMPLATE.md)）：
    - 覆盖平台产物表 / 变更分类 / 升级指南 / 发版前 checklist（含 `pnpm doctor` 三 profile + `changeset status` + 手工 E5 同意路径验收）。

- **P9 · 打磨包 A（观测 / 错误 / 诊断）**：
  - **P9-1 · 结构化日志 + 敏感字段脱敏**（[P9-1](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-1-日志系统统一)）：
    - 新增 [packages/ai-runtime/src/observability/redaction.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/redaction.ts) —— `createRedactor()` 默认脱敏 `apiKey / token / authorization / email / password / secret` 等；支持 `maxDepth`、循环引用与 `[Truncated]` / `[Circular]` 占位；
    - 新增 [packages/ai-runtime/src/observability/logger.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/logger.ts) —— `createStructuredLogger()` 输出 JSON `{ts, level, msg, bindings, meta}`，支持 6 级 level 短路 / `child(bindings)` 上下文继承 / `err` 字段错误序列化 / 自定义 sink；
    - 通过 [packages/ai-runtime/src/observability/index.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/index.ts) 统一导出；
    - 单测：[redaction.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/tests/observability/redaction.test.ts) + [logger.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/tests/observability/logger.test.ts) 共 25 用例覆盖脱敏边界、level 过滤、child 上下文、Error 序列化。
  - **P9-4 · 错误码 & UI 提示**（[P9-4](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-4-错误分类与友好化)）：
    - [packages/ai-sdk/src/errors.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/errors.ts) 扩展 `E_NO_KEY / E_QUOTA / E_TIMEOUT / E_TOOL_DENIED / E_PROFILE_MISS`，`AIClientError` 携带 `retryable / hint`，并采用 IPC 兼容协议 `[CODE(|R)?(|hint:HINT)?] message`（旧 `[CODE] msg` 仍可解析）；
    - 渲染进程侧独立实现 [packages/ai-sdk-client/src/errors.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/errors.ts) 的 `SDKError.fromIpc` + `parseIpcMessage`，保持包大小干净；新增 [packages/ai-sdk-client/src/errorHint.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/errorHint.ts) 输出 `{title, description, retryable, action, code}`，覆盖 5 类 CTA（`open-settings / switch-provider / retry / check-profile / dismiss`）；
    - ai-chat 新增 [ErrorHint](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/components/ErrorHint/index.tsx) 组件并在 [MessageInput](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/components/MessageInput/index.tsx) 中启用，替换原始 `❌ {state.error}` 文本；
    - 单测：ai-sdk [tests/contracts/errors.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/tests/contracts/errors.test.ts)（10 用例）+ ai-sdk-client [tests/errors.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/tests/errors.test.ts)（9 用例）+ [tests/errorHint.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/tests/errorHint.test.ts)（7 用例），双端契约对称。
  - **P9-5 · dsh-doctor 增强**（[P9-5](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-5-doctor-与首次启动向导)）：
    - 新增 [scripts/lib/doctor/index.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/lib/doctor/index.ts) —— 纯函数 `runDoctor()` 返回 `DoctorReport { status, node, checks[], profile }`，节点级检查覆盖 Node 版本（对齐根 `engines.node`）+ 运行平台/架构，profile 装配复用 `loadProfile` + `composeEntries` 并聚合 skipped-patch 警告；
    - [scripts/dsh-doctor.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/dsh-doctor.ts) 支持 `--report=<path>` 写盘 JSON 报告；status 汇总为 `ok / warn / fail`（fail 退出码 1）；
    - 单测：[scripts/__tests__/doctor.test.ts](file:///Users/botycookie/self/ai-live2d-client/scripts/__tests__/doctor.test.ts) 14 用例（含 ok / warn / fail 三态、Node 版本比较、JSON round-trip、summarizeStatus）；
    - `pnpm doctor {waifu,chat-only,mcp-headless}` 在本机三 profile 全绿。
- **三端 headless E2E 冒烟骨架**（[P8-8](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-8-e2e-冒烟三端-三-profile)）：
  - 新增 [e2e/](file:///Users/botycookie/self/ai-live2d-client/e2e) 目录：`AIClient + IPCTransportServer + EventBroadcaster` 真实组装，通过 [FakeIpcAdapter](file:///Users/botycookie/self/ai-live2d-client/e2e/helpers/fakeIpc.ts) / [FakeSeams](file:///Users/botycookie/self/ai-live2d-client/e2e/helpers/fakeSeams.ts) / [e2eRuntime](file:///Users/botycookie/self/ai-live2d-client/e2e/helpers/e2eRuntime.ts) 无 Electron 依赖执行；
  - 用例：E1（waifu tts→lip-sync + turn-end 广播）/ E2（chat-only sendMessage + tool:executed）/ E3（三 profile 装配 + doctor stdout 校验）/ E4（userProfile 写→广播→读一致）；
  - 配置：[vitest.e2e.config.ts](file:///Users/botycookie/self/ai-live2d-client/vitest.e2e.config.ts) + 根脚本 [`pnpm run test:e2e`](file:///Users/botycookie/self/ai-live2d-client/package.json)（不影响 `pnpm test`）；
  - 真实 Playwright headed 复跑与 E5 危险工具确认弹窗延到 [P9-11](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-11-e2e-补齐p8-8-交接项)。
- **Electron 主进程注册 `electron-native` TtsProvider**：
  - 新增 [TtsElectronNativeProvider](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/TtsElectronNativeProvider.ts)，把遗留 [AdvancedTTSEngine](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/services/AdvancedTTSEngine.ts) 适配为 dsh `TtsProvider`，`info.id = 'electron-native'`；
  - 装配点：[Application.startAIRuntime](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/core/Application.ts#L119-L145) 通过 [`AIRuntimeBootOptions.ttsProviders`](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/AIRuntimeBoot.ts#L53-L64) 注入；
  - **兼容行为**：当 profile 未加载 [`@ig-live/bundle-ig-electron-caps`](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps) 的 `TtsPlugin` 时，[`tryRegisterTtsProviders`](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/ai/AIRuntimeBoot.ts#L88-L112) 会捕获 `SEAM_NOT_INJECTED` 并 log warn，**不阻塞**主流程；
  - 单测：[TtsElectronNativeProvider.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/electron/tests/unit/ai/TtsElectronNativeProvider.test.ts)（11 用例，覆盖 info / synth / stream / stop / listVoices / makeReqId / contract shape）。
- **迁移脚本工具箱**（[P8-6](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-6-配置迁移脚本) / [P8-7](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-7-数据迁移脚本)）：
  - [migrate-config](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-config.ts)：`userData/config.json` → dsh `llm.providers[]` + keyStore，支持 `--dry-run` / `--input` / `--out`；
  - [migrate-history](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-history.ts)：旧 `chat_history.json` → dsh JSONL session log；
  - [migrate-user-profile](file:///Users/botycookie/self/ai-live2d-client/scripts/migrate-user-profile.ts)：旧 chat settings → dsh `UserProfile`；
  - 三个脚本均为纯 Node，不依赖 Electron；各配套单测总计 14 用例。
- 新增 [docs/consumer-integration.md](file:///Users/botycookie/self/ai-live2d-client/docs/consumer-integration.md)：三端（Electron main / renderer / ai-chat）接入 dsh 的 checklist。

### Changed
- [Application.startAIRuntime](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/core/Application.ts#L119-L145) 现在会构造 `AdvancedTTSEngine` 实例并作为 `electron-native` provider 注入到 `client.tts`——**从 UI 直接调用 `AdvancedTTSEngine.speak` 的路径已不再推荐**。

### Deprecated
- **`ai:legacy:*` IPC 通道**（由 [`AiChatCompat`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/legacy/AiChatCompat.ts) 提供的旧 `ai-chat:*` 反射层）：
  - **状态**：仍然可用，但每次调用都会打印一条 `deprecated: ai:legacy:<method>` 的 warn 日志；
  - **下线窗口**：自当前 minor 起，**保留 2 个 minor 版本**（即在 `+2 minor` 版本移除）；
  - **迁移指引**：把渲染进程/预加载脚本中的 `window.electronAPI.sendAIChat(...)` 全部替换为 `window.aiIPC.invoke('ai:chat:sendMessage', ...)` 或直接使用 [`ClientAIClient`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/AIClient.ts)；
  - 参考：[P8-5 · 旧 IPC 与 Mock 下线](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P8-consumer-migration.md#p8-5-旧-ipc-与-mock-下线)。
- **UI 直读 `AdvancedTTSEngine`**：请统一改为 `client.tts.synth(...)`（会走 `electron-native` provider）。老代码仍可运行，将在 `+1 minor` 后移除。

### Removed
- `packages/electron/src/handlers/ipc/AiChatIpcHandler.ts`（含全部 Mock 分支）已删除，取而代之的是 [`AiChatCompat`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/legacy/AiChatCompat.ts)（P8-4 落地时同步完成）。
- `packages/ai-chat/src/services/AIService.ts` 与 `packages/ai-chat/src/services/adapters/`（`AdapterFactory` + `BaseAdapter` + `DeepSeekAdapter` + `OpenAIAdapter`）已删除，`crypto-js` / `axios` 依赖同步从 [ai-chat/package.json](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/package.json) 移除。

### Migration Notes（升级操作清单）

1. **首次启动**会自动执行迁移脚本；如需 dry-run：
   ```bash
   pnpm exec tsx scripts/migrate-config.ts --input userData/config.json --dry-run
   pnpm exec tsx scripts/migrate-history.ts --input userData/chat_history.json --dry-run
   pnpm exec tsx scripts/migrate-user-profile.ts --input userData/settings.json --dry-run
   ```
2. 备份文件命名：迁移完成后原文件保留为 `<原名>.legacy.json`。
3. `ai:legacy:*` 只在渲染进程 warn 日志中出现；生产环境 log level=warn 时会推入监控。

---

## Legend

- **[Unreleased]**：尚未打标签、但已合入 `main`（或长期 feature 分支）的变更；
- 类别遵循 Keep a Changelog：`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`。
