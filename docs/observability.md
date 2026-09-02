# 可观测性（Observability）· P9

> 覆盖 **P9-1 日志 · P9-2 指标 · P9-3 追踪** 三块。整体思路：**接口先行、默认零依赖、
> 可插拔真实后端**。所有输出端在关闭状态下都不会产生任何网络请求（对齐 P9 §退出准则 6）。

## 全景一览

| 关切   | 模块                                                                                                                    | 默认后端                        | 生产可切换                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| 日志   | [logger.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/logger.ts)             | `console.<level>` + JSON        | 注入 `LogSink`（pino / winston / 文件流）          |
| 脱敏   | [redaction.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/redaction.ts)       | 默认字段列表 + WeakSet 循环防御 | `extraKeys` / `placeholder` / `maxDepth`           |
| 指标   | [metrics.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/metrics.ts)           | 进程内 `defaultRegistry`        | `MetricsRegistry.toPrometheus()` → HTTP `/metrics` |
| 追踪   | [tracing.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/tracing.ts)           | no-op tracer（不分配对象）      | `configureTracing({ exporter })` → OTLP HTTP       |
| 事件桥 | [ObservabilityBridge.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/ObservabilityBridge.ts) | 关闭                            | `EventBroadcaster({ observability: true })`        |

## P9-1 · 结构化日志

```ts
import { createStructuredLogger } from '@ig-live/ai-runtime';

const logger = createStructuredLogger({
  level: 'info',
  bindings: { app: 'ai-runtime' },
});

const sess = logger.child({ sessionId: 's1' });
sess.info('turn started', { turnId: 't1' });
// → {"ts":"...","level":"info","msg":"turn started",
//    "bindings":{"app":"ai-runtime","sessionId":"s1"},"meta":{"turnId":"t1"}}
```

- 所有日志字段都会走 [createRedactor](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/redaction.ts#L50-L88) 脱敏，`apiKey / token / password` 等替换为 `***`。
- `Error` 对象自动拆到顶层 `err: { name, message, stack, code }`。
- `sink` 可注入 pino / winston；默认走 `console.<level>` 打印 JSON。

## P9-2 · 指标采集

### 内置 8 个指标（对应 P9 计划）

| 指标（Prometheus name）         | 类型      | Labels                       |
| ------------------------------- | --------- | ---------------------------- |
| `ai_chat_tokens_prompt`         | Counter   | `provider, model, sessionId` |
| `ai_chat_tokens_completion`     | Counter   | `provider, model`            |
| `ai_chat_latency_ttfb_ms`       | Histogram | `provider, model`            |
| `ai_tool_exec_duration_ms`      | Histogram | `tool`                       |
| `ai_tool_error_count`           | Counter   | `tool, code`                 |
| `ai_tts_latency_first_chunk_ms` | Histogram | `provider`                   |
| `ai_asr_latency_final_ms`       | Histogram | `provider`                   |
| `ai_agent_steps_per_turn`       | Histogram | `sessionId`                  |

### 用法

```ts
import { AI_METRICS, defaultRegistry } from '@ig-live/ai-runtime';

AI_METRICS.chatTokensPrompt.inc({ provider: 'openai', model: 'gpt-4', sessionId: 's1' }, 120);

const stopTimer = AI_METRICS.toolExecDuration.startTimer({ tool: 'write_file' });
await runTool();
stopTimer(); // 自动 observe 到 histogram

// Prometheus text expose（HTTP handler 直接 return 即可）
const body = defaultRegistry.toPrometheus();
```

### 事件驱动埋点

用 [ObservabilityBridge](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/ObservabilityBridge.ts) 把 `AIClient` 事件自动翻译为 metrics 调用，
在 [EventBroadcaster](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/EventBroadcaster.ts) 打开：

```ts
const broadcaster = new EventBroadcaster({
  adapter,
  observability: true, // 简写：使用默认 registry + 默认 tracer
  // observability: { metricsEnabled: false } // 或按需关闭 metrics
});
```

翻译规则：

| 事件                                | 副作用                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `tool:executed { durationMs }`      | `ai_tool_exec_duration_ms.observe`                                                 |
| `tool:executed { ok:false, error }` | `ai_tool_error_count.inc({ tool, code })`（`code` 从 `[E_XXX\|...]` IPC 协议提取） |
| `agent:turn-end`                    | `ai_agent_steps_per_turn.observe(steps)` + 关闭 `chat.turn` span                   |
| `message:complete`                  | 若 `message.meta.usage` 存在 → tokens/ttfb 埋点                                    |
| `tts:chunk`（seq=0）                | `ai_tts_latency_first_chunk_ms.observe`                                            |

## P9-3 · 追踪（OpenTelemetry 兼容）

### 接口对齐 OTel 语义

- `SpanKind`: `internal / client / server / producer / consumer`
- `SpanStatusCode`: `unset / ok / error`
- `SpanContext`: `{ traceId(32hex), spanId(16hex) }`
- `Span.addEvent / setAttribute / setStatus / recordException / end`
- 子 span 自动继承 parent `traceId + parentSpanId`

### 默认零依赖

```ts
import { configureTracing, getTracer } from '@ig-live/ai-runtime';

// 应用启动时调用一次
configureTracing({ serviceName: 'ai-runtime' });

const tracer = getTracer();
await tracer.withSpan('chat.turn', undefined, async (span) => {
  span.setAttribute('chat.session_id', 's1');
  span.addEvent('llm.prompt.sent');
  return await runTurn();
});
```

- 未调用 `configureTracing()` 时，`getTracer()` 返回 no-op tracer，`startSpan` 全部为
  静态单例，不分配对象；
- `configureTracing({ enabled: false })` 显式禁用（DevTools/E2E 场景）；
- 所有 attributes 走 redaction；`apiKey / token / Authorization` 一律替换为 `***`。

### 接入真实 OTLP

`AI_OTLP_ENDPOINT` 环境变量约定：默认**空 = 关闭**，业务方读取该变量后自行装配
`@opentelemetry/exporter-trace-otlp-http` 并注入 `configureTracing({ exporter })`：

```ts
import { readOtlpEndpoint, configureTracing } from '@ig-live/ai-runtime';

const endpoint = readOtlpEndpoint(); // 未设置返回 undefined
if (endpoint) {
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
  configureTracing({
    serviceName: 'ai-runtime',
    exporter: {
      export: (spans) => exporter.export(spans as never, () => {}),
      shutdown: () => exporter.shutdown(),
    },
  });
}
```

关闭状态下**不会产生任何网络请求**——满足 P9 §退出准则 6（Sentry / OTLP 关闭时无网络请求，防隐私泄漏）。

## 事件桥接（Metrics ↔ Tracing）

[ObservabilityBridge](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/ObservabilityBridge.ts) 把 `AIClient` 事件同时喂给 metrics 与 tracer：

- 一次 `chat.turn` span 生命周期：
  - `agent:step` → span.addEvent('agent.step', { step, reason })
  - `tool:confirm-required` → span.addEvent('tool.confirm-required', { tool })
  - `tts:chunk (seq=0)` → span.addEvent('tts.first_chunk', { elapsedMs })
  - `agent:turn-end` → `chat.session_id / chat.turn.id / chat.agent.steps` +
    `setStatus({ code: 'ok' | 'error' })` + `end()`

- span 结束后自动调用 `MetricsRegistry.observe`，实现 tokens/latency 关联。

## Diagnostics UI（后续）

`ai-chat/settings/Diagnostics` 页（P9-2 计划）会消费
[MetricsRegistry.snapshot()](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/observability/metrics.ts#L189-L217) 呈现最近 24h 摘要，
本 sprint 暂未落地（放在 Polish D）。

## 相关计划

- [P9-1 · 日志系统统一](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-1-日志系统统一)
- [P9-2 · 指标采集](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-2-指标采集)
- [P9-3 · 追踪 (OpenTelemetry)](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-3-追踪-opentelemetry)
- [P9-6 · 安全审计](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P9-polish-observability-release.md#p9-6-安全审计)（留待 Polish D，与 metrics/tracing 出网复核联动）
