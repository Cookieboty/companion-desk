# 多模态 AI 助手 · Agent Harness 设计文档

> 版本：v2.2 · 2026-09-01
> 状态：待评审（评审通过后进入实施）
> 范围：**直接依赖开源 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 作为 AI 基座**（不再自研 Layer 0），新增 3 个共享包（ai-sdk / ai-runtime / ai-sdk-client）+ 3 个 dsh bundle 插件（`bundle-ig-base` / `bundle-ig-live2d` / `bundle-ig-electron-caps`）+ 3 份 profile，改造 ai-chat / renderer / electron 三个消费方
> 更新记录：
> - v2.2：**放弃自研 mini-Cordis，改为完整使用开源 `@deepseek-ai/dsh` 作为 AI 基座**；本项目只贡献 dsh bundle + profile + seam provider；`ai-sdk/runtime/sdk-client` 三层退化为"业务门面 + Electron 桥接 + 渲染 IPC 代理"薄层
> - v2.1：引入 `ai-kernel` 基座层（Layer 0），借鉴 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 Cordis 内核（自研版）
> - v2.0：抽出独立 SDK 三层架构，看板娘升为一等公民 AI 消费方
> - v1.0：初版，能力集中在 ai-chat 包内

---

## 0. 文档说明

本文档面向 **ai-live2d-client** 项目，规划一套：

1. **多模态 AI 服务矩阵**（LLM / ASR / TTS / Vision / ImageGen，本地+远端并存）
2. **Agent Harness（智能体运行时）**：让 LLM 从"只会说话"升级为"能规划、能调用工具、能感知环境"的桌面 AI 伴侣
3. **共享 SDK 三层架构**：把上述能力封装为独立 SDK 包，让 **看板娘（renderer）** 与 **AI 对话应用（ai-chat）** 与 **Electron 主进程（MCP 等）** 共享同一份消息、记忆、事件流与 Agent 能力

评审通过后按【实施路线图】分阶段开工。

---

## 1. 现状与差距

### 1.1 项目现状

- Monorepo（pnpm workspace + Turborepo），三大包：
  - `packages/electron` · 主进程 / IPC / 全局键盘 / 语音 / MCP
  - `packages/renderer` · Live2D 看板娘展示
  - `packages/ai-chat` · 独立 React 应用（AI 对话 UI）
- 已有能力：
  - LLM 适配器骨架（DeepSeek、OpenAI 已实现）
  - IPC 通道齐全但 **AI 对话为 mock 实现**
  - MCP 生态较完善（VirtualCharacterMCPServer 已可控制看板娘和语音）
  - 系统 TTS 引擎（AdvancedTTSEngine，走 macOS `say` / Windows SAPI）
  - 全局键盘监听 + 关键词语音反馈

### 1.2 主要差距

| 差距 | 现状 | 目标 |
|---|---|---|
| 本地 LLM 缺失 | AdapterFactory 抛未实现 | Ollama + llama.cpp |
| 远端 LLM 稀少 | 仅 OpenAI/DeepSeek | +Claude/Gemini/通义/豆包 |
| IPC 未真通 | 返回模拟字符串 | 真实调用 AIService |
| 无 Agent 能力 | 一问一答 | ReAct 循环 + 工具调用 |
| 无独立 ASR | 无 | 本地 Whisper + 远端 Whisper/火山/Azure |
| TTS 无远端 | 仅系统 TTS | +OpenAI/Azure/Edge-TTS/ElevenLabs |
| 无 Vision | 无 | 本地 LLaVA / 远端 GPT-4o、Claude 3.5、Qwen-VL |
| 无 ImageGen | 无 | 本地 SD-WebUI / 远端 DALL-E、Flux、通义万相 |
| 无麦克风 | 只监听键盘 | 录音 + 唤醒词 + 抓屏 + 剪贴板 |

---

## 2. 总体架构

### 2.1 分层视图

```
┌──────────────────────────────────────────────────────────────────┐
│  用户输入源                                                        │
│  文字 · 麦克风 · 唤醒词 · 抓屏 · 剪贴板图片 · Live2D 触摸          │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│           Agent Harness (智能体运行时) · ⭐核心新增                 │
│   Planner ─▶ Executor ─▶ Observer ─▶ Memory  (ReAct 循环 N 步)    │
└──────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────┬───────┴────────┬────────────────┐
        ▼               ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐
│ModalityRouter│ │ ToolRegistry │ │    Memory    │ │ Guardrails │
│ (模态路由)   │ │  (工具注册)  │ │  (会话/长期) │ │ (安全策略) │
└──────────────┘ └──────────────┘ └──────────────┘ └────────────┘
        │
        ├──────────┬──────────┬───────────┬────────────┐
        ▼          ▼          ▼           ▼            ▼
    ┌──────┐   ┌──────┐  ┌──────┐   ┌────────┐  ┌────────┐
    │ LLM  │   │ ASR  │  │ TTS  │   │ Vision │  │ImageGen│
    └──────┘   └──────┘  └──────┘   └────────┘  └────────┘
   本地: Ollama/llama.cpp    Whisper.cpp     SystemTTS/Edge   LLaVA/Qwen-VL   SD-WebUI/Comfy
   远端: OpenAI/DeepSeek/Claude/Gemini/通义/豆包 · OpenAIWhisper/Azure/火山 · OpenAI/Azure/11Labs · GPT-4o/Claude/Gemini/Qwen-VL · DALL-E/Flux/万相
```

### 2.2 关键原则

| # | 原则 | 说明 |
|---|---|---|
| P1 | **统一抽象** | 每个模态一个 `BaseProvider<Req,Res>`；新增/替换 provider 零改动 |
| P2 | **本地优先** | 每个模态必须至少 1 个本地 provider，无网可用 |
| P3 | **流式一致** | LLM/ASR/TTS 使用同一 `onChunk` 回调模式 |
| P4 | **懒加载** | Provider 按需 `initialize()`，避免启动加载重资源 |
| P5 | **降级链** | 每模态可配置多 provider 降级列表 |
| P6 | **凭证安全** | apiKey 存主进程 ConfigService 加密落盘，UI 不直接持有 |
| P7 | **看板娘联动** | ASR/TTS/思考/工具调用都触发 Live2D 动作或表情 |
| P8 | **可观测性** | Agent 每步 Thought/Action/Observation 事件流可回放 |
| P9 | **SDK 环境无关** | 核心逻辑封装为独立 SDK 包，纯 TS 无 Electron/DOM 依赖 |
| P10 | **依赖注入** | 需要落盘/密钥/系统能力的地方通过接口注入，SDK 不硬编码环境 |
| P11 | **状态单例** | Provider 配置/密钥/记忆/会话由 Runtime 单例持有，跨消费方广播 |
| P12 | **API 对称** | 渲染进程通过 IPC 消费的 API 与直接 import SDK 的 API 一模一样 |
| P13 | **AI 基座直用 dsh** | 内核层完整复用开源 [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness) 的 Cordis 运行时；本项目**不写内核代码**，只写 dsh bundle 插件 + profile + seam provider |
| P14 | **Session Log 是唯一真相** | 复用 dsh 的 `ctx.sessions` append-only 事件日志与 `deriveMessages()` 投影；模型可见 ⇒ 已入 log 由 dsh 断言保证 |

### 2.3 SDK 三层架构总览

```
┌────────────────────────────────────────────────────────────────────┐
│  消费方（3 个，未来可扩展）                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ ai-chat UI   │  │ renderer     │  │ electron 主进程            │ │
│  │ (对话应用)   │  │ (看板娘)     │  │ (MCP Server / 全局服务)    │ │
│  │ • 完整对话   │  │ • 完整 Agent │  │ • MCP 工具响应             │ │
│  │ • Agent 面板 │  │ • 触摸触发   │  │ • 全局键盘触发             │ │
│  │ • 多模态输入 │  │ • 主动搭话   │  │ • 定时任务                 │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│         │                 │                       │                │
│         └────────┬────────┴───────────────────────┘                │
└──────────────────┼─────────────────────────────────────────────────┘
                   │  统一 API：import { AIClient } from '@ig-live/ai-sdk'
                   ▼
┌────────────────────────────────────────────────────────────────────┐
│  @ig-live/ai-sdk  ⭐ Layer 1 · 独立 SDK（纯 TS，环境无关）           │
│  ├── modalities/    Provider 抽象 + 各家实现（LLM/ASR/TTS/Vision）  │
│  ├── harness/       Agent 运行时（Planner/Executor/Memory/Guard）   │
│  ├── tools/         工具注册中心（BaseTool + Registry）             │
│  ├── memory/        记忆存储抽象（IMemoryStorage 可插拔）           │
│  ├── messages/      Message 数据模型 + Stream 事件模型              │
│  ├── sessions/      Session/Conversation 管理                       │
│  ├── events/        跨消费方事件总线                                │
│  ├── transport/     Transport 抽象（HTTP 直连内置，IPC 由外部注入） │
│  └── AIClient.ts    ⭐ SDK 顶层入口                                  │
└────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────┐
│  @ig-live/ai-runtime  ⭐ Layer 2 · Electron 主进程运行时             │
│  持有 SDK 单例，负责状态、持久化、跨窗口协调                        │
│  ├── AIRuntimeService.ts   全局单例 + 生命周期                      │
│  ├── IPCTransportServer.ts 把 SDK 全部 API 自动暴露为 IPC 通道       │
│  ├── FileMemoryStorage.ts  IMemoryStorage 的文件实现                 │
│  ├── SafeKeyStore.ts       apiKey 加密存储（safeStorage）           │
│  ├── ConfigStore.ts        AppConfig 持久化                          │
│  ├── LocalToolExecutor.ts  抓屏/剪贴板/文件等本地能力实现            │
│  └── EventBroadcaster.ts   主进程事件广播到所有渲染窗口              │
└────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────┐
│  @ig-live/ai-sdk-client  ⭐ Layer 3 · 渲染进程薄客户端                │
│  通过 IPC Transport 消费 SDK，API 与直调 SDK 100% 一致              │
│  ├── IPCTransportClient.ts  渲染进程 IPC 客户端                      │
│  ├── ClientAIClient.ts      与 AIClient 同接口的透明代理             │
│  ├── react/                                                        │
│  │   ├── AIProvider.tsx     React Context 注入                     │
│  │   ├── useAIClient.ts     获取 client 实例                         │
│  │   ├── useChat.ts         对话 Hook（含流式）                      │
│  │   ├── useAgent.ts        Agent 任务 Hook（步骤流）               │
│  │   ├── useTTS.ts / useASR.ts / useVision.ts / useImageGen.ts     │
│  │   ├── useSessions.ts     会话列表                                 │
│  │   └── useMemory.ts       长期记忆                                 │
│  └── index.ts                                                       │
└────────────────────────────────────────────────────────────────────┘
```

**三包职责边界**：

| 包 | 环境 | 状态 | 职责 | 依赖 |
|---|---|---|---|---|
| `@ig-live/ai-sdk` | 纯 TS，可跑 Node / 浏览器 / Electron | 无 | 定义接口、Provider 实现、Agent 逻辑 | 仅 fetch + zod 等纯库 |
| `@ig-live/ai-runtime` | Electron 主进程 | 单例 | 密钥、记忆持久化、IPC 服务端、跨窗口协调 | ai-sdk + electron + fs |
| `@ig-live/ai-sdk-client` | Electron 渲染进程 | 无 | IPC 客户端 + React Hooks | ai-sdk (types only) + react |

### 2.4 AI 基座：直接使用开源 DeepSeek Harness (dsh)

本项目**不自研内核**，直接以 npm 依赖形式集成 [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness)（MIT 协议，Cordis 架构，`everything-is-a-plugin`）。

#### 2.4.1 我们直接复用 dsh 的哪些能力

| # | dsh 能力 | 复用方式 | 本项目落地位置 |
|---|---|---|---|
| U1 | **Cordis Context** (`ctx`) — 共享上下文，插件注册 service/event/effect | 直接 `import { Context } from '@deepseek-ai/dsh'` | 全体 bundle 插件 |
| U2 | **Everything-is-a-plugin** — 模型适配器 / 工具 / 会话日志 / Agent Loop 皆为插件 | 用 dsh 的 `definePlugin({ apply(ctx) })` 编写业务插件 | `bundle-ig-*` 三个包 |
| U3 | **Reversible effects** — 插件卸载自动回滚 | 直接调用 `ctx.effect(dispose)` | 所有 seam provider |
| U4 | **`ctx.sessions`** — append-only 事件日志 + `deriveMessages()` | 无需重写 | 会话、fork、resume 免费获得 |
| U5 | **Turn / Step 主循环** — `turn/start → step/start → agent/request → llm/stream → assistant/chunk → tool/call → tools/pre-execute → tool/result → step/end → turn/end` | 直接使用 dsh 的 `core/agent-loop` | 无需实现 |
| U6 | **Waterfall vs Serial 事件总线** — `agent/*`、`llm/stream`、`tools/*` 是 waterfall；`agent/turn-stopping` 是 serial | dsh 原生支持 | 拦截器仅需订阅 |
| U7 | **Capability Seams** — `ctx.llm/tools/fs/shell/sandbox/subprocess/terminals/jobs/commands/goals/sessionTitle/telemetry` | 直接 `ctx.use(...)` 消费；本项目**只需注册新增的 4 个 seam**（见 §2.4.3） | 消费+扩展 |
| U8 | **`agent.ctx` 作用域** — agent 卸载即回滚 | 用 dsh 原生 API | 看板娘临时工具自动清理 |
| U9 | **`agent.inject(context)`** — 排队进入下一 admitted request | 用 dsh 原生 API | 触摸 / 剪贴板 / 唤醒词的被动上下文注入 |
| U10 | **Isolate Realm**（预设级隔离命名空间） | 通过 `preset: { isolate: true }` 声明 | 看板娘 vs ai-chat 会话互不污染 |
| U11 | **Profile + Bundle + Patch YAML** — `dsh --profile waifu --dump-config` | 本项目提供 3 份 profile（`waifu` / `chat-only` / `mcp-headless`）和 3 个 bundle，注册进 `dsh.profile` / `dsh.bundle` 字段 | [profiles/](file:///Users/botycookie/self/ai-live2d-client/profiles) |
| U12 | **`dsh doctor / dump-config` CLI** | 直接用 dsh 自带命令排障 | 无需实现 |
| U13 | **LLM Provider 生态** — dsh 内置的 OpenAI / Claude / Gemini / Ollama 等适配器 | 优先复用；仅在缺失时（如豆包、通义特殊参数）自行写 dsh-plugin | Provider 生态零成本 |

#### 2.4.2 本项目相对 dsh 需要"新增"的部分

只有以下四类工作是本项目 workspace 需要写的代码：

| 类别 | 交付物 | 数量 | 说明 |
|---|---|---|---|
| **新增 Seam** | `ctx.live2d` / `ctx.screen` / `ctx.clipboard` / `ctx.mcp` 的接口 + provider | 4 | dsh 无对应 seam，我们定义接口并在对应环境提供实现 |
| **Bundle 插件包** | `bundle-ig-base` / `bundle-ig-live2d` / `bundle-ig-electron-caps` | 3 | 每个 bundle 是一个 npm 包，`package.json` 带 `dsh.bundle` 字段 |
| **Profile 组合** | `waifu.yml` / `chat-only.yml` / `mcp-headless.yml` | 3 | 声明 bundles 顺序 + patch 覆盖 |
| **Runtime 桥接** | `ai-runtime` 里用 `dsh.boot(profile)` 装配 + `registerIpcHandlers(ctx)` 把 ctx 桥给渲染进程 | 1 层 | 无内核代码，只有 IPC 序列化 |

**净收益**：内核代码从"约 500 行自研 mini-Cordis + Session Log + Agent Loop"变为 **零行**；本项目专注业务插件与 seam 实现。

#### 2.4.3 本项目新增的 4 个 Seam（dsh 原生没有）

| Seam Key | 接口 | 默认 provider 所在 bundle | 消费方 |
|---|---|---|---|
| `ctx.live2d` | `playMotion / setExpression / driveLipSync(rms)` | `bundle-ig-live2d`（在 renderer 环境注册） | Agent 工具、TTS 联动 |
| `ctx.screen` | `capture(region?) → {filepath, base64}` | `bundle-ig-electron-caps`（主进程） | Vision 工具、快捷键 |
| `ctx.clipboard` | `readImage() / readText() / watch()` | `bundle-ig-electron-caps` | 被动上下文注入 |
| `ctx.mcp` | `listTools() / callTool(name, args)` | `bundle-ig-base`（桥接现有 MCP Server） | Agent 工具集 |

每个 seam 都符合 dsh 的"接口 + provider + consumer"三角约定。

#### 2.4.4 集成方式（npm 依赖）

```jsonc
// packages/ai-runtime/package.json
{
  "dependencies": {
    "@deepseek-ai/dsh": "^0.1.2-alpha.2",
    "@ig-live/bundle-ig-base": "workspace:*",
    "@ig-live/bundle-ig-electron-caps": "workspace:*"
  }
}

// packages/renderer/package.json（看板娘）
{
  "dependencies": {
    "@deepseek-ai/dsh": "^0.1.2-alpha.2",   // 仅用类型和 seam key
    "@ig-live/bundle-ig-live2d": "workspace:*",
    "@ig-live/ai-sdk-client": "workspace:*"
  }
}
```

启动：

```typescript
// packages/electron/src/main.ts
import { boot } from '@deepseek-ai/dsh';

const ctx = await boot({
  profile: 'waifu',                          // 指向 profiles/waifu.yml
  home: app.getPath('userData') + '/dsh',    // dsh 落盘目录
  patch: userCustomPatch,                    // 用户 UI 里配置的覆盖
});

// ctx 已经装配好 llm/tools/sessions/agents/live2d/screen/clipboard/mcp 等 seam
```

排障：

```sh
npx dsh --profile waifu --dump-config     # 打印实际装配的插件树 + patch 覆盖
npx dsh doctor                            # dsh 自带健康检查
```

---

## 3. 目录结构（新增/改造）

**总览**：**AI 内核直接使用 npm 包 [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness)（Layer 0，第三方依赖，不占本仓库代码量）**。本仓库新增：

- **3 个 dsh bundle 包**（Layer 0.5，业务插件）：`bundle-ig-base` / `bundle-ig-live2d` / `bundle-ig-electron-caps`
- **3 个 workspace 包**（Layer 1~3，业务门面）：`ai-sdk` / `ai-runtime` / `ai-sdk-client`
- **3 份 profile YAML**：`waifu` / `chat-only` / `mcp-headless`

三大消费方（`ai-chat` / `renderer` / `electron`）改造为依赖 SDK；`electron` 主进程调用 `dsh.boot(profile)` 装配 ctx。

### 3.0 dsh 基座（直接 npm 依赖，无本地代码）

```
node_modules/@deepseek-ai/dsh/            ← 第三方包，MIT
  ├── packages/core/session                 ctx.sessions（会话事件日志）
  ├── packages/core/system-prompt           ctx.systemPrompt
  ├── packages/core/tools                   ctx.tools
  ├── packages/core/agent                   ctx.agents
  ├── packages/core/agent-loop              turn/step 主循环
  ├── packages/core/scope                   agent.ctx 作用域
  ├── packages/llm/llm                      ctx.llm + 通用 provider
  ├── packages/bundle/base                  dsh-base（基础 bundle）
  └── packages/boot/app-boot                Profile/Bundle/Patch 装配器
```

**使用约束**：

- 版本锁定在 `^0.1.2-alpha.2`（当前 developer preview，注意 dsh 声明"THERE WILL BE COMPATIBILITY-BREAKING CHANGES"，本项目在 CI 中固化最小可用版本；升级前先跑 §14 Phase 0.c 冒烟测试）
- 不 fork 源码，不 patch，如需扩展一律走 "写一个 dsh-plugin" 的路径
- 本项目所有 bundle 的 `package.json` 都在 `dsh.bundle` 字段声明入口，遵循 dsh 官方分发格式

### 3.0.1 新建 packages/bundle-ig-base（dsh bundle · 通用能力）

```
packages/bundle-ig-base/                  ⭐ 新建 dsh bundle 包（跨环境可加载）
├── package.json                           必含 "dsh": { "bundle": "./dist/patch.yml" }
├── src/
│   ├── index.ts                           export default definePlugin({...})
│   ├── plugins/
│   │   ├── LLMProvidersPlugin.ts          注册 OpenAI/DeepSeek/Ollama/Qwen/Doubao/Claude/Gemini
│   │   │                                    对 dsh 未内置的 provider（豆包等）自行 dsh-plugin
│   │   ├── MemoryPolicyPlugin.ts          在 ctx.systemPrompt 里加入长期事实/摘要 section
│   │   ├── McpBridgePlugin.ts             ctx.provide(McpKey, McpBridge) + 桥接 MCP Server
│   │   ├── ToolsBuiltinPlugin.ts          注册 time_now / random / echo 等无环境依赖工具
│   │   └── GuardrailsPlugin.ts            拦截 tools/pre-execute：白名单/RateLimit/DangerConfirm
│   ├── seams/
│   │   └── mcp.ts                         defineService<McpService>('ctx.mcp')
│   └── patch.yml                          bundle 默认配置（row id + config）
└── tests/
```

### 3.0.2 新建 packages/bundle-ig-live2d（dsh bundle · 看板娘专用）

```
packages/bundle-ig-live2d/                ⭐ 只在 renderer 环境加载
├── package.json                           "dsh": { "bundle": "./dist/patch.yml" }
├── src/
│   ├── index.ts                           export default definePlugin({...})
│   ├── plugins/
│   │   ├── Live2dSeamPlugin.ts            ctx.provide(Live2dKey, RendererLive2dProvider)
│   │   │                                    playMotion / setExpression / driveLipSync(rms)
│   │   ├── TouchInjectPlugin.ts           监听 Live2D 触摸 → ctx.agents.inject(sensory part)
│   │   ├── TtsLipSyncPlugin.ts            订阅 tts:chunk → 驱动 Live2D 嘴型
│   │   ├── WaifuAgentPresetPlugin.ts      预设 waifu 会话（isolate realm + 专属工具）
│   │   └── WaifuToolsPlugin.ts            live2d_play_motion / live2d_set_expression Tool
│   ├── seams/
│   │   └── live2d.ts                      defineService<Live2dService>('ctx.live2d')
│   └── patch.yml
└── tests/
```

### 3.0.3 新建 packages/bundle-ig-electron-caps（dsh bundle · Electron 主进程能力）

```
packages/bundle-ig-electron-caps/         ⭐ 只在主进程加载
├── package.json                           "dsh": { "bundle": "./dist/patch.yml" }
├── src/
│   ├── index.ts                           export default definePlugin({...})
│   ├── plugins/
│   │   ├── ScreenSeamPlugin.ts            ctx.provide(ScreenKey, ElectronScreenProvider)
│   │   ├── ClipboardSeamPlugin.ts         ctx.provide(ClipboardKey, ElectronClipboardProvider)
│   │   ├── SafeKeyStorePlugin.ts          用 electron safeStorage 加密落盘 apiKey
│   │   ├── FileSessionStorePlugin.ts      覆盖 ctx.sessions 的持久化后端（JSONL 落 userData）
│   │   ├── WakeWordPlugin.ts              监听唤醒词 → ctx.agents.inject 或直接 sendUserMessage
│   │   ├── AsrPlugin.ts / TtsPlugin.ts    绑定 ASR/TTS provider 到 ctx.asr/ctx.tts seam
│   │   └── ShortcutPlugin.ts              全局快捷键 → ctx.commands.dispatch
│   ├── seams/
│   │   ├── screen.ts                      defineService<ScreenService>('ctx.screen')
│   │   ├── clipboard.ts
│   │   ├── asr.ts / tts.ts                本项目扩展的模态 seam
│   └── patch.yml
└── tests/
```

### 3.0.4 profiles/（dsh 装配模板）

```
profiles/                                 ⭐ 项目根级 profile YAML
├── waifu.yml                              看板娘 profile：ig-base + ig-live2d + ig-electron-caps
├── chat-only.yml                          纯对话 profile：ig-base + ig-electron-caps
└── mcp-headless.yml                       无头 MCP Server profile：ig-base
```

**waifu.yml 示例**：

```yaml
# profiles/waifu.yml
name: waifu
bundles:
  - dsh-base                                        # dsh 自带
  - '@ig-live/bundle-ig-base'                       # 本仓库
  - '@ig-live/bundle-ig-live2d'                     # 本仓库
  - '@ig-live/bundle-ig-electron-caps'              # 本仓库
patch:                                              # row id 覆盖
  - id: llm.default
    config: { provider: 'ollama', model: 'qwen2.5:7b' }
  - id: agent.loop
    config: { maxSteps: 6, autoConfirmTools: ['live2d_play_motion'] }
  - id: session.title
    config: { provider: 'heuristic' }
```

**chat-only.yml 示例**：

```yaml
name: chat-only
bundles:
  - dsh-base
  - '@ig-live/bundle-ig-base'
  - '@ig-live/bundle-ig-electron-caps'
patch:
  - id: llm.default
    config: { provider: 'openai', model: 'gpt-4o-mini' }
```

**mcp-headless.yml 示例**：

```yaml
name: mcp-headless
bundles:
  - dsh-headless                                    # dsh 自带的 one-shot bundle
  - '@ig-live/bundle-ig-base'                       # 只挂 LLM/工具/MCP 桥接
```

装配（一行代码）：

```typescript
import { boot } from '@deepseek-ai/dsh';
const ctx = await boot({ profile: 'waifu', home: app.getPath('userData') + '/dsh' });
// ctx 已经含 ctx.llm/tools/sessions/agents/live2d/screen/clipboard/mcp/asr/tts
```

### 3.0.5 Extension Cookbook（"要加 X 就注册 Y"）

| 目标 | 机制（全部走 dsh 原生 API） |
|---|---|
| 新增 LLM provider | 写 dsh-plugin：`ctx.use(LLMKey).register(id, adapter)` |
| 新增模型可用工具 | `ctx.use(ToolsKey).register(schema, exec)`，schema 自动进入 systemPrompt |
| 给单个会话独立工具集 | 用 `agent.ctx.plugin(...)`，agent 结束 dsh 自动回滚 |
| 新增本地能力（截屏/剪贴板） | `ctx.provide(ScreenKey, impl)` |
| 拦截请求/工具/结束 | 用 `agent/*` 或 `tools/*` waterfall；`agent/turn-stopping` 可中止 |
| 追加模型可见上下文（触摸/剪贴板） | `ctx.agents.inject(sessionId, part)`，进入下一 admitted request |
| 新增 UI / 编辑器集成 | 订阅 `session/event`，驱动 `ctx.agents` |
| Fork 一个正在运行的会话 | `ctx.sessions.fork(source, boundary?)` |
| 排障 / 观察实际装配 | `npx dsh --profile waifu --dump-config` |

### 3.0.6 与 SDK 三层的依赖关系

```
┌───────────────────────────────────────────────────────┐
│  Layer 3 · @ig-live/ai-sdk-client（渲染 IPC + Hooks） │
└──────────────────────┬────────────────────────────────┘
                       │ IPC
┌──────────────────────▼────────────────────────────────┐
│  Layer 2 · @ig-live/ai-runtime（Electron 主进程桥接） │
│  • dsh.boot('waifu') 装配 ctx                         │
│  • 挂载 bundle-ig-base + bundle-ig-electron-caps      │
│  • registerIpcHandlers(ctx) 把 seam 桥给渲染进程      │
└──────────────────────┬────────────────────────────────┘
                       │ 使用
┌──────────────────────▼────────────────────────────────┐
│  Layer 1 · @ig-live/ai-sdk（业务门面 AIClient）        │
│  • 内部通过 ctx.use(seam) 消费 dsh + 自定义 seam       │
│  • 保持 API 稳定，屏蔽 dsh 版本升级的表面变动          │
└──────────────────────┬────────────────────────────────┘
                       │ 依赖
┌──────────────────────▼────────────────────────────────┐
│  Layer 0.5 · bundle-ig-base / bundle-ig-live2d /      │
│              bundle-ig-electron-caps（本仓库 bundle）  │
└──────────────────────┬────────────────────────────────┘
                       │ 依赖（peerDependency）
┌──────────────────────▼────────────────────────────────┐
│  Layer 0 · @deepseek-ai/dsh（第三方 npm 包，不改源）  │
│  Cordis Context + Plugin + SessionLog + AgentLoop     │
│  内置 Seam: llm/tools/sessions/agents/systemPrompt/... │
└───────────────────────────────────────────────────────┘
```

**依赖方向**：`ai-sdk-client → ai-sdk → { bundle-ig-* } → @deepseek-ai/dsh`；`ai-runtime → { ai-sdk, bundle-ig-base, bundle-ig-electron-caps, @deepseek-ai/dsh }`；`renderer → { ai-sdk-client, bundle-ig-live2d }`。

---

### 3.1 packages/ai-sdk（Layer 1 · 业务门面，环境无关）

> **改造要点**：v1.0 里 `modalities / harness / tools / memory / sessions / events` 这些能力，v2.2 全部**下沉到 dsh 或本仓库的 bundle-ig-\* 里**，`ai-sdk` 不再自建实现，只保留：**AIClient 门面 + 业务级类型 + 参数校验**。

```
packages/ai-sdk/                          ⭐ 新建包（纯 TS，仅业务门面）
├── src/
│   ├── AIClient.ts                        ⭐⭐ SDK 顶层入口
│   │                                        构造函数接收一个 dsh Context（由 runtime 传入）
│   │                                        内部通过 ctx.use(seam) 组合调用，屏蔽 dsh 表面变动
│   │
│   ├── facade/                            门面方法（对齐消费方心智，不引入新概念）
│   │   ├── ChatFacade.ts                    sendMessage / stream / abort（薄封装 ctx.agents）
│   │   ├── SessionFacade.ts                 list/create/fork/rename（薄封装 ctx.sessions）
│   │   ├── ToolsFacade.ts                   list/register/setEnabled（薄封装 ctx.tools）
│   │   ├── MemoryFacade.ts                  facts/summaries 查询（薄封装 MemoryPolicyPlugin）
│   │   ├── AsrFacade.ts / TtsFacade.ts      薄封装 ctx.asr / ctx.tts seam
│   │   └── Live2dFacade.ts                  薄封装 ctx.live2d seam（仅渲染进程可用）
│   │
│   ├── types/                             业务级 DTO（跨端 IPC 契约，稳定 API）
│   │   ├── Message.ts                       统一消息模型（三端共享，映射自 dsh session event）
│   │   ├── Session.ts / ToolSpec.ts / MemoryFact.ts
│   │   └── events.ts                        AIClientEvent 枚举（订阅 ctx 事件后再对外发）
│   │
│   ├── config/
│   │   ├── AppConfig.ts                     业务配置（provider 选择、快捷键等）
│   │   └── validators.ts                    zod schema 校验
│   │
│   ├── di/                                只留业务级 DI，其他 DI（KeyStore/Storage）由 bundle 提供
│   │   └── ILogger.ts
│   │
│   └── index.ts                            导出 AIClient / facades / types
│
├── tests/                                  单元测试（用 dsh 提供的 test context）
├── package.json                            dependencies: '@deepseek-ai/dsh', '@ig-live/bundle-ig-base'
├── tsconfig.json
└── README.md
```

**下沉去向对照表**：

| v1.0 位置 | v2.2 归属 |
|---|---|
| `modalities/llm/providers/*` | `bundle-ig-base/plugins/LLMProvidersPlugin.ts`（复用 dsh 内置 provider，缺的自写 dsh-plugin） |
| `modalities/asr,tts,vision,imageGen` | `bundle-ig-electron-caps`（主进程能力）+ 新增 `ctx.asr/ctx.tts` seam |
| `harness/*`（Planner/Executor 主循环） | dsh `packages/core/agent-loop` 原生提供 |
| `tools/*` | dsh `ctx.tools` + `bundle-ig-base/ToolsBuiltinPlugin` + `GuardrailsPlugin` |
| `memory/*` | dsh `ctx.systemPrompt` sections + `bundle-ig-base/MemoryPolicyPlugin` |
| `messages/*` | dsh `session/event` 日志 → `ai-sdk/types/Message.ts` 做映射 |
| `sessions/*` | dsh `ctx.sessions`（含 fork/isolate） |
| `events/*` | dsh Waterfall/Serial 事件总线 |
| `transport/HttpTransport` | dsh provider 内部实现，不再暴露 |
| `di/IKeyProvider / ILocalToolExecutor` | `bundle-ig-electron-caps` 的 SafeKeyStorePlugin / Screen/Clipboard Seam |

### 3.2 packages/ai-runtime（Layer 2 · Electron 主进程运行时）

```
packages/ai-runtime/                     ⭐ 新建包（仅在 Electron 主进程使用）
├── src/
│   ├── AIRuntimeService.ts               全局单例；持有 AIClient；生命周期
│   ├── IPCTransportServer.ts             把 AIClient 全部 API 通过反射自动导出为 IPC 通道
│   ├── EventBroadcaster.ts               主进程事件 → 所有渲染窗口广播
│   │
│   ├── storage/
│   │   ├── FileMemoryStorage.ts          IMemoryStorage 文件实现
│   │   ├── SafeKeyStore.ts               IKeyProvider · safeStorage 加密
│   │   └── ConfigStore.ts                AppConfig 落盘（不含 key）
│   │
│   ├── executors/
│   │   ├── ElectronToolExecutor.ts       ILocalToolExecutor 主进程实现
│   │   ├── CaptureService.ts             抓屏（desktopCapturer）
│   │   ├── ClipboardService.ts           剪贴板
│   │   ├── AudioRecordService.ts         录音协调
│   │   ├── WakeWordService.ts            唤醒词
│   │   ├── MCPBridge.ts                  接入 VirtualCharacterMCPServer 工具
│   │   └── FileToolExecutor.ts           读文件/列目录
│   │
│   ├── logger/
│   │   └── ElectronLogger.ts             ILogger 实现（脱敏）
│   │
│   └── index.ts
│
├── package.json                          依赖：@ig-live/ai-sdk + electron
└── tsconfig.json
```

### 3.3 packages/ai-sdk-client（Layer 3 · 渲染进程薄客户端）

```
packages/ai-sdk-client/                  ⭐ 新建包（渲染进程使用）
├── src/
│   ├── IPCTransportClient.ts             渲染进程 IPC 客户端
│   ├── ClientAIClient.ts                 与 AIClient 同接口的透明代理
│   │
│   ├── react/
│   │   ├── AIProvider.tsx                React Context 注入
│   │   ├── useAIClient.ts
│   │   ├── useChat.ts                    对话 Hook（含流式）
│   │   ├── useAgent.ts                   Agent 任务 Hook（步骤流）
│   │   ├── useTTS.ts / useASR.ts
│   │   ├── useVision.ts / useImageGen.ts
│   │   ├── useSessions.ts                会话列表
│   │   ├── useMemory.ts                  长期记忆
│   │   ├── useProviders.ts               provider 管理
│   │   └── useAIEvents.ts                订阅跨消费方事件
│   │
│   └── index.ts
│
├── package.json                          依赖：@ig-live/ai-sdk (types) + react
└── tsconfig.json
```

### 3.4 消费方改造

```
packages/ai-chat/                        [改造] 从"自建 services"改为"消费 SDK"
├── src/
│   ├── main.tsx                          用 <AIProvider client={ClientAIClient}> 包裹
│   ├── components/
│   │   ├── ConfigPanel/                  改造：使用 useProviders / useActive
│   │   ├── MessageInput/                 扩展：麦克风/图片/朗读/生图
│   │   ├── MessageList/
│   │   │   ├── AgentStepView.tsx         ⭐ 展示 Agent 步骤
│   │   │   └── ImageAttachment.tsx       ⭐ 图片消息
│   │   └── ProviderPicker/               ⭐ 顶部快切
│   ├── services/                         删除大部分！只保留 UI 强相关的
│   │   └── (原 adapters/AIService.ts 全部迁入 ai-sdk 后删除)
│   └── contexts/AiChatContext.tsx        改为薄封装（会话切换等 UI 状态）

packages/renderer/                       [改造] 看板娘接入 SDK · 一等公民
├── src/
│   ├── App.tsx                           用 <AIProvider> 包裹
│   ├── components/
│   │   ├── MessageBubble/                改造：订阅 useChat 或 useAIEvents 显示 AI 回复
│   │   ├── Live2D/                       不变
│   │   └── WaifuAgentTrigger/            ⭐ 新建：触摸/唤醒词 → 发起 useAgent 任务
│   ├── hooks/
│   │   ├── useWaifuMessage.ts            改造：接入 useChat
│   │   ├── useWaifuAgent.ts              ⭐ 新建：封装看板娘的 Agent 场景
│   │   └── useTTSLipSync.ts              ⭐ 新建：订阅 tts:playing 事件驱动嘴部动画
│   └── (Live2D 其它保留)

packages/electron/                       [改造] 注入 ai-runtime 并保留原 handlers
├── src/
│   ├── core/
│   │   ├── Application.ts                启动时 new AIRuntimeService()
│   │   └── (其它保留)
│   ├── mcp/
│   │   ├── VirtualCharacterMCPServer.ts  改造：内部使用 AIRuntimeService.client
│   │   └── (其它保留)
│   ├── handlers/ipc/
│   │   ├── AiChatIpcHandler.ts           改造：删除 mock，全部转交 IPCTransportServer
│   │   └── (其它按需保留)
│   └── main.ts                           初始化 AIRuntimeService，注入 preload
```

### 3.5 依赖关系图

```
                     ┌─────────────────┐
                     │  @ig-live/      │
                     │    ai-sdk       │◄──────────────┐
                     └────────▲────────┘               │
                              │                        │
              ┌───────────────┴───────────────┐        │
              │                               │        │
    ┌─────────┴─────────┐          ┌─────────┴───────┴──┐
    │  @ig-live/        │          │  @ig-live/          │
    │    ai-runtime     │          │    ai-sdk-client    │
    └─────────▲─────────┘          └─────────▲───────────┘
              │                              │
              │                    ┌─────────┴──────────┐
              │                    │                    │
    ┌─────────┴─────────┐  ┌──────┴──────┐   ┌─────────┴─────┐
    │  packages/        │  │ packages/   │   │ packages/     │
    │    electron       │  │  renderer   │   │   ai-chat     │
    │  (主进程)         │  │ (看板娘UI)  │   │ (对话 UI)     │
    └───────────────────┘  └─────────────┘   └───────────────┘
```

---

## 4. 核心类型定义

### 4.1 通用 Provider 基类

```typescript
// modalities/BaseProvider.ts
export type Modality = 'llm' | 'asr' | 'tts' | 'vision' | 'imageGen';

export interface ProviderMeta {
  id: string;
  name: string;
  modality: Modality;
  provider: string;              // "openai" | "ollama" | ...
  isLocal: boolean;
  capabilities: {
    streaming?: boolean;
    toolCall?: boolean;          // LLM
    multiModal?: boolean;        // LLM
    realtime?: boolean;          // ASR/TTS 流式
    voiceClone?: boolean;        // TTS
    maxImageSize?: number;       // Vision
    supportedFormats?: string[]; // ASR/TTS
  };
}

export abstract class BaseProvider<Req, Res, ChunkT = unknown> {
  abstract readonly meta: ProviderMeta;
  abstract initialize(cfg: ProviderConfig): Promise<void>;
  abstract invoke(req: Req): Promise<Res>;
  stream?(req: Req, onChunk: (c: ChunkT) => void): Promise<void>;
  abstract testConnection(): Promise<boolean>;
  abstract dispose(): Promise<void>;
}
```

### 4.2 LLM

```typescript
// modalities/llm/types.ts
export interface ToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<TextPart | ImagePart>;   // 支持多模态
  toolCallId?: string;
  toolCalls?: ToolCall[];
  name?: string;
}
export interface LLMRequest {
  messages: LLMMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json' | 'json_schema';
}
export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}
export interface LLMStreamChunk {
  delta?: string;
  toolCallDelta?: Partial<ToolCall>;
  finished?: boolean;
  usage?: LLMResponse['usage'];
}
```

### 4.3 ASR

```typescript
// modalities/asr/types.ts
export interface ASRRequest {
  audio: Buffer | string;              // Buffer 或文件路径
  format: 'wav' | 'mp3' | 'pcm' | 'webm' | 'ogg';
  sampleRate?: number;                 // pcm 必填
  language?: string;                   // 'zh' | 'en' | 'auto'
  hotwords?: string[];                 // 提高识别率
  timestamps?: boolean;
}
export interface ASRSegment { start: number; end: number; text: string }
export interface ASRResult {
  text: string;
  segments?: ASRSegment[];
  language?: string;
  duration?: number;
}
export interface ASRStreamChunk {
  partial: string;                     // 中间结果
  isFinal: boolean;
  segment?: ASRSegment;
}
```

### 4.4 TTS

```typescript
// modalities/tts/types.ts
export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  preview?: string;
}
export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;                      // 0.5-2.0
  pitch?: number;                      // -12 ~ 12
  volume?: number;                     // 0-1
  format?: 'mp3' | 'wav' | 'pcm' | 'opus';
  emotion?: string;                    // 部分 provider 支持
  streamMode?: boolean;
}
export interface TTSResult {
  audio: Buffer;
  format: string;
  duration?: number;
  visemes?: Array<{ time: number; viseme: string }>;  // 用于对口型
}
export interface TTSStreamChunk {
  chunk: Buffer;
  isFinal: boolean;
}
```

### 4.5 Vision

```typescript
// modalities/vision/types.ts
export interface VisionImage {
  source: 'url' | 'base64' | 'filepath';
  data: string;
  mimeType?: string;
}
export interface VisionRequest {
  prompt: string;
  images: VisionImage[];
  maxTokens?: number;
  detail?: 'low' | 'high' | 'auto';    // OpenAI 特有
}
export interface VisionResult {
  content: string;
  usage?: LLMResponse['usage'];
}
```

### 4.6 ImageGen

```typescript
// modalities/imageGen/types.ts
export interface ImageGenRequest {
  prompt: string;
  negativePrompt?: string;
  size?: string;                       // "512x512" | "1024x1024" | "1024x1792"
  count?: number;
  seed?: number;
  steps?: number;
  cfgScale?: number;
  style?: string;
  referenceImage?: string;             // 图生图
}
export interface ImageGenResult {
  images: Array<{ url?: string; base64?: string; filepath?: string; seed?: number }>;
  model?: string;
}
```

### 4.7 Agent

```typescript
// harness/types.ts
export interface AgentTask {
  id: string;
  userMessage: string;
  attachments?: { images?: VisionImage[]; audio?: Buffer };
  sessionId: string;
  systemPrompt?: string;
  maxSteps?: number;
  timeout?: number;
  allowedTools?: string[];             // 白名单
  mode: 'chat' | 'agent';              // 兼容普通对话
}
export interface AgentStep {
  stepIndex: number;
  type: 'thought' | 'action' | 'observation' | 'final';
  thought?: string;
  toolCall?: ToolCall;
  toolResult?: unknown;
  finalAnswer?: string;
  timestamp: number;
  durationMs?: number;
}
export type AgentEvent =
  | { kind: 'step'; step: AgentStep }
  | { kind: 'llm_delta'; text: string }
  | { kind: 'tool_start'; name: string; args: unknown }
  | { kind: 'tool_end'; name: string; result: unknown; error?: string }
  | { kind: 'done'; finalAnswer: string; totalSteps: number }
  | { kind: 'error'; message: string };
```

### 4.8 配置模型（重构）

```typescript
// types/config.ts
export interface ProviderConfig {
  id: string;                          // 唯一，如 "openai-gpt4o-1"
  name: string;                        // 显示名
  modality: Modality;
  provider: string;                    // "openai" | "ollama" | ...
  isLocal: boolean;
  enabled: boolean;

  apiUrl?: string;
  apiKey?: string;                     // 通过 ProviderKeyStore 加密保存
  model?: string;

  // 模态专属（扁平字段，按需使用）
  temperature?: number;
  maxTokens?: number;
  voice?: string;
  language?: string;
  size?: string;

  extra?: Record<string, unknown>;     // 各家私有参数（region、secret 等）
}

export interface AppConfig {
  chat: {
    theme: 'light' | 'dark';
    language: 'zh-CN' | 'en-US';
    fontSize: number;
    autoSave: boolean;
    maxHistoryLength: number;
  };
  providers: ProviderConfig[];
  active: {                            // 每模态当前激活 provider id
    llm?: string;
    asr?: string;
    tts?: string;
    vision?: string;
    imageGen?: string;
  };
  fallback: {                          // 降级链：主 provider 失败依次尝试
    llm?: string[];
    asr?: string[];
    tts?: string[];
    vision?: string[];
    imageGen?: string[];
  };
  agent: {
    enabled: boolean;
    maxSteps: number;                  // 默认 10
    timeoutMs: number;                 // 默认 60000
    allowedTools: string[];            // 白名单，空=全部
    autoConfirmTools: string[];        // 无需确认的工具
    reactMode: 'function-call' | 'text-prompt';  // 依赖模型能力
  };
  interaction: {                       // 全量交互配置
    microphone: {
      enabled: boolean;
      pushToTalk: boolean;             // 按住说话 vs 自动 VAD
      vadThreshold?: number;
    };
    wakeWord: {
      enabled: boolean;
      keyword: string;                 // "你好看板娘"
      engine: 'porcupine' | 'custom-asr';
    };
    screenCapture: {
      enabled: boolean;
      hotkey?: string;                 // "Alt+Shift+S"
    };
    clipboard: {
      autoDetectImage: boolean;
      hotkey?: string;                 // "Alt+V" 塞给 AI
    };
  };
}
```

### 4.9 AIClient 顶层入口（SDK 唯一门面）

```typescript
// @ig-live/ai-sdk/AIClient.ts
export interface AIClientOptions {
  config?: AppConfig;                        // 初始配置（可后续通过 setConfig 更新）
  memoryStorage?: IMemoryStorage;            // 默认 InMemoryStorage
  keyProvider?: IKeyProvider;                // 默认从 config.providers[].apiKey 读取
  toolExecutor?: ILocalToolExecutor;         // 抓屏/剪贴板/文件工具，可为空（无本地工具）
  transport?: ITransport;                    // 默认 HttpTransport
  logger?: ILogger;                          // 默认 console
  clock?: IClock;                            // 默认系统时钟
}

export class AIClient {
  constructor(opts?: AIClientOptions);

  // === 多模态服务 ===
  readonly llm: LLMService;
  readonly asr: ASRService;
  readonly tts: TTSService;
  readonly vision: VisionService;
  readonly imageGen: ImageGenService;

  // === Agent ===
  readonly agent: {
    run(task: AgentTask): AsyncIterable<AgentEvent>;    // 迭代器方式消费事件
    cancel(taskId: string): void;
    listActive(): AgentTask[];
  };

  // === 消息 / 会话 ===
  readonly sessions: {
    create(opts?: CreateSessionOptions): Session;
    get(id: string): Session | null;
    list(): Session[];
    remove(id: string): void;
    send(sessionId: string, msg: Partial<Message>): Promise<Message>;   // 便捷发送
    stream(sessionId: string, msg: Partial<Message>): AsyncIterable<MessageStreamChunk>;
    getMessages(sessionId: string): Message[];
    clear(sessionId: string): void;
  };

  // === 记忆 ===
  readonly memory: {
    getFacts(scope?: string): Promise<Fact[]>;
    addFact(f: Fact): Promise<void>;
    removeFact(id: string): Promise<void>;
    summarize(sessionId: string): Promise<string>;
  };

  // === Provider 与配置 ===
  readonly providers: {
    list(modality?: Modality): ProviderConfig[];
    add(cfg: ProviderConfig): Promise<void>;
    update(id: string, patch: Partial<ProviderConfig>): Promise<void>;
    remove(id: string): Promise<void>;
    test(id: string): Promise<boolean>;
    setActive(modality: Modality, id: string): Promise<void>;
    getActive(modality: Modality): ProviderConfig | null;
  };

  // === 事件总线（跨消费方）===
  on<K extends keyof AIEvents>(event: K, handler: (data: AIEvents[K]) => void): () => void;
  off<K extends keyof AIEvents>(event: K, handler: (data: AIEvents[K]) => void): void;
  emit<K extends keyof AIEvents>(event: K, data: AIEvents[K]): void;

  // === 生命周期 ===
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

// 事件谱
export interface AIEvents {
  'message:added':        { sessionId: string; message: Message };
  'message:updated':      { sessionId: string; message: Message };
  'message:stream':       { sessionId: string; chunk: MessageStreamChunk };
  'agent:step':           { taskId: string; step: AgentStep };
  'agent:done':           { taskId: string; finalAnswer: string };
  'tts:start':            { text: string; providerId: string };
  'tts:chunk':            { audio: Buffer };
  'tts:end':              { durationMs: number };
  'asr:partial':          { text: string };
  'asr:final':            { text: string };
  'provider:changed':     { modality: Modality; id: string };
  'memory:updated':       { scope: string; facts: Fact[] };
  'wakeword:detected':    { keyword: string };
  'error':                { source: string; error: Error };
}
```

**设计要点**：
- `agent.run()` 返回 **AsyncIterable**，消费方可以 `for await ... of` 遍历事件，天然支持流式
- 事件总线跨越三个消费方（Runtime 内广播 → IPC → 各渲染进程）
- 所有异步方法均返回 Promise；所有事件均基于订阅模式
- ClientAIClient 通过 IPC 代理保证签名 100% 一致，UI 无需感知位置

### 4.10 SDK 依赖注入接口

```typescript
// di/IMemoryStorage.ts
export interface IMemoryStorage {
  loadSession(sessionId: string): Promise<Message[]>;
  saveSession(sessionId: string, messages: Message[]): Promise<void>;
  listSessions(): Promise<Session[]>;
  removeSession(id: string): Promise<void>;
  loadFacts(scope?: string): Promise<Fact[]>;
  saveFacts(facts: Fact[]): Promise<void>;
}

// di/IKeyProvider.ts
export interface IKeyProvider {
  getApiKey(providerId: string): Promise<string | undefined>;
  setApiKey(providerId: string, key: string): Promise<void>;
  removeApiKey(providerId: string): Promise<void>;
}

// di/ILocalToolExecutor.ts
export interface ILocalToolExecutor {
  listAvailableTools(): ToolSchema[];               // 声明可用的本地工具
  invoke(toolName: string, args: unknown): Promise<unknown>;
}

// di/ILogger.ts
export interface ILogger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

// di/IClock.ts
export interface IClock { now(): number; }
```

**默认实现**（`ai-sdk` 内置）：`InMemoryStorage`、`ConfigKeyProvider`（从 config 读 apiKey）、`NullToolExecutor`（无本地工具）、`ConsoleLogger`、`SystemClock`。

**替换实现**（`ai-runtime` 提供）：
- `FileMemoryStorage`（Electron userData 落盘）
- `SafeKeyStore`（Electron safeStorage 加密）
- `ElectronToolExecutor`（抓屏/剪贴板/文件/MCP 桥接）
- `ElectronLogger`（复用现有 [LoggerService](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/services/LoggerService.ts)）

---

## 5. 三端集成模式（消费方接入方式）

### 5.1 ai-chat 应用（渲染进程 · 完整对话 UI）

```tsx
// packages/ai-chat/src/main.tsx
import { ClientAIClient } from '@ig-live/ai-sdk-client';
import { AIProvider } from '@ig-live/ai-sdk-client/react';

const client = new ClientAIClient({ ipc: window.aiChatAPI });

createRoot(document.getElementById('root')!).render(
  <AIProvider client={client}>
    <App />
  </AIProvider>
);

// packages/ai-chat/src/components/MessageList/index.tsx
import { useChat } from '@ig-live/ai-sdk-client/react';
export function MessageList({ sessionId }) {
  const { messages, isStreaming } = useChat({ sessionId });
  return messages.map(m => <MessageBubble key={m.id} msg={m} />);
}
```

### 5.2 renderer 看板娘（渲染进程 · 一等公民 Agent 消费方）

```tsx
// packages/renderer/src/App.tsx
import { ClientAIClient } from '@ig-live/ai-sdk-client';
import { AIProvider } from '@ig-live/ai-sdk-client/react';

const client = new ClientAIClient({ ipc: window.waifuAPI });   // 同一份 IPC，桥接同一个 Runtime

<AIProvider client={client}>
  <Live2dWidget />
  <MessageBubble />
  <WaifuAgentTrigger />
</AIProvider>

// packages/renderer/src/hooks/useWaifuAgent.ts  ⭐ 看板娘专属 Agent 封装
import { useAgent, useAIEvents } from '@ig-live/ai-sdk-client/react';

export function useWaifuAgent() {
  const { run, steps, isRunning } = useAgent({ sessionId: 'waifu-default', mode: 'agent' });

  // 触摸看板娘 → 发起 Agent 任务
  const onTouch = (part: string) => {
    run({ userMessage: `主人摸了我的${part}`, allowedTools: ['live2d_play_motion', 'tts_speak'] });
  };

  // 唤醒词 → 开麦 → ASR → 发送
  useAIEvents('wakeword:detected', async () => {
    // 触发录音、ASR、然后 run(...)
  });

  return { onTouch, steps, isRunning };
}

// packages/renderer/src/hooks/useTTSLipSync.ts  ⭐ 联动 Live2D
import { useAIEvents } from '@ig-live/ai-sdk-client/react';
export function useTTSLipSync(model) {
  useAIEvents('tts:start', () => model.playMotion('speaking'));
  useAIEvents('tts:end',   () => model.playMotion('idle'));
  useAIEvents('tts:chunk', ({ audio }) => model.driveMouthByRms(audio));
}
```

**关键效果**：
- ai-chat 里用户发送的消息、Agent 步骤、AI 回复，**看板娘那边同步显示气泡 + 说话动作**（`message:added` / `tts:start` 事件广播）
- 看板娘触摸触发的 Agent 任务，**ai-chat 侧对话流里也能看到**（因为共享同一 session）
- 两侧共享同一份长期记忆（"主人叫 xxx"）

### 5.3 electron 主进程（MCP Server 与后台任务）

```typescript
// packages/electron/src/main.ts
import { AIRuntimeService } from '@ig-live/ai-runtime';

const runtime = await AIRuntimeService.create({
  userDataPath: app.getPath('userData'),
});
await runtime.initialize();          // 加载 config、注册 IPC、启动降级链等

// packages/electron/src/mcp/VirtualCharacterMCPServer.ts
import { AIRuntimeService } from '@ig-live/ai-runtime';

async function handleMcpCall(toolName, args) {
  const client = AIRuntimeService.instance.client;
  if (toolName === 'ask_ai') {
    const resp = await client.llm.chat({ messages: [{ role: 'user', content: args.q }] });
    return resp.content;
  }
  // ...
}
```

### 5.4 跨消费方状态一致性保证

| 状态 | 存储位置 | 同步方式 | 消费方感知 |
|---|---|---|---|
| Provider 配置 | Runtime.ConfigStore | 广播 `provider:changed` | UI 自动刷新 |
| API 密钥 | Runtime.SafeKeyStore | 从不下发；仅 Runtime 内部持有 | 渲染进程永远拿不到明文 |
| 会话消息 | Runtime.FileMemoryStorage | 广播 `message:added/updated/stream` | 看板娘 & ai-chat 同步显示 |
| 长期记忆 | Runtime.FileMemoryStorage | 广播 `memory:updated` | 全端 hook 自动更新 |
| Agent 任务 | Runtime (内存) | 广播 `agent:step/done` | 看板娘 & ai-chat 都能观察进度 |
| TTS 播放 | Runtime | 广播 `tts:start/chunk/end` | 看板娘做嘴型 & ai-chat 显示波形 |

---

## 6. Agent Harness 详细设计

### 6.1 主循环（ReAct）

```
runTask(task):
  memory.load(sessionId)
  systemPrompt = template.build(availableTools, memory.summary)
  messages = [system, ...memory.recent, user(task.message)]

  for step = 0 .. maxSteps:
    if now - startAt > timeout: break

    llmResp = llm.stream(messages, tools=registry.schemas)

    if llmResp.toolCalls empty:
       emit(final)
       break

    for call in llmResp.toolCalls:
       guardrails.check(call)                # 权限/循环/预算
       result = executor.run(call)           # 可并行工具调用
       messages.push(tool(result))
       emit(step)

  memory.persist()
```

### 6.2 双模式兼容

- **function-call 模式**：模型支持 tools（OpenAI/Claude/Qwen/Gemini/Ollama-tools）
- **text-prompt 模式**：模型不支持 tools（小模型/老模型），使用文本协议：
  ```
  Thought: ...
  Action: tool_name
  Action Input: {"key":"value"}
  Observation: <运行时注入>
  ...
  Final Answer: ...
  ```
  Executor 用正则解析

### 6.3 Memory 设计（四层记忆）

| 层级 | 载体 | 生命周期 | 作用 |
|---|---|---|---|
| L1 短期滑窗 | dsh `ctx.sessions` 事件日志 | 单轮对话 | 最近 N 轮消息（token 限额） |
| L2 会话摘要 | dsh `ctx.sessions` + summary section | 单会话 | 每 5 步生成总结，防上下文膨胀 |
| L3 **用户偏好薄层记忆** | `memory/user_profile.json` | **跨会话、跨设备可导出** | **记录用户长期偏好、习惯、行为统计**（详见 §6.3.1） |
| L4 长期事实 | `memory/facts.json` | 跨会话 | "我是 xxx / 我的项目在 xxx" 等硬事实 |

- **会话隔离**：按 `sessionId` 分文件保存 `memory/sessions/<id>.json`（dsh 原生）
- **注入方式**：L2/L3/L4 都以 section 形式注入 `ctx.systemPrompt`，由 [MemoryPolicyPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/MemoryPolicyPlugin.ts) 统一编排

### 6.3.1 用户偏好薄层记忆（UserPreferenceMemory）

> **定位**：一层"薄"的、结构化的、可解释、可编辑、可导出的用户画像。不做向量检索，不做深度模型推理，只做**规则抽取 + LLM 轻量提炼 + 硬 schema 存储**——保证快、可预测、可关闭。

#### （1）数据模型 [UserProfile](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types/UserProfile.ts)

```typescript
// packages/ai-sdk/src/types/UserProfile.ts
export interface UserProfile {
  version: 1;
  updatedAt: string;                        // ISO
  identity: {                               // 硬身份（可空）
    displayName?: string;
    locale?: string;                        // 'zh-CN' | 'en-US' | ...
    timezone?: string;                      // 'Asia/Shanghai'
  };
  preferences: {                            // 显式偏好（用户或规则写入）
    replyStyle?: 'concise' | 'detailed' | 'bullet' | 'story';
    replyLanguage?: string;                 // 优先回复语言
    tone?: 'formal' | 'casual' | 'cute';    // 看板娘尤其吃这一项
    codeStyle?: {                           // 编程偏好
      language?: string;                    // 'ts' | 'py' | ...
      indent?: 2 | 4 | 'tab';
      framework?: string[];                 // ['react', 'fastapi']
      commentLang?: 'zh' | 'en';
    };
    llm?: {                                 // 模型选择偏好
      preferredProvider?: string;
      preferredModel?: string;
      temperature?: number;
    };
    tts?: { voice?: string; speed?: number; enabled?: boolean };
    asr?: { autoSubmit?: boolean; language?: string };
    ui?: {                                  // UI 交互偏好
      theme?: 'light' | 'dark' | 'system';
      density?: 'compact' | 'comfortable';
      messageRenderMode?: 'markdown' | 'plain';
    };
    live2d?: {                              // 看板娘个性化
      defaultMotion?: string;
      touchReactivity?: number;             // 0~1
      idleTalkiness?: number;               // 空闲主动搭话概率
    };
  };
  habits: {                                 // 隐式习惯（统计出来的）
    activeHours?: number[];                 // 一天中活跃时段（0~23）
    topTopics?: Array<{ topic: string; count: number; lastAt: string }>;
    topTools?: Array<{ tool: string; count: number }>;
    avgSessionLen?: number;                 // 平均会话轮数
    stopGenerationRate?: number;            // 中断生成占比 → 反映"回复太长"倾向
    regenRate?: number;                     // 重新生成占比 → 反映"不满意"倾向
  };
  dislikes?: string[];                      // 用户明确说过的"不要 xxx"
  notes?: Array<{ at: string; text: string; source: 'user' | 'inferred' }>;
}
```

#### （2）写入通道（三路来源，按可信度排序）

| 通道 | 触发 | 可信度 | 实现 |
|---|---|---|---|
| A. 用户显式设置 | Settings UI 里勾选/输入 | ★★★★★ | 直接 `ctx.userProfile.set(patch)` |
| B. 规则抽取器 | 每条用户消息/事件流经中间件 | ★★★★ | [PreferenceExtractor](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/PreferenceExtractor.ts) —— 关键词/正则/模式匹配 |
| C. LLM 轻量提炼 | 每 N 轮或会话结束时批量跑一次 | ★★★ | [PreferenceDistiller](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/PreferenceDistiller.ts) —— 用小模型 + 严格 JSON schema 输出 |
| D. 交互统计器 | 订阅 dsh 事件计数 | ★★★ | [HabitStatCollector](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/HabitStatCollector.ts) —— 只更新 `habits.*` |

规则抽取示例（不需要调用模型，纯本地）：

| 用户话术 | 抽取动作 |
|---|---|
| "以后回答简短一点 / 别啰嗦" | `preferences.replyStyle = 'concise'` |
| "用中文回复 / 说中文" | `preferences.replyLanguage = 'zh-CN'` |
| "我更喜欢 React / 用 TypeScript" | `codeStyle.framework += 'react'`；`codeStyle.language = 'ts'` |
| "换个可爱点的语气" | `tone = 'cute'` |
| "别用 xx 库 / 讨厌 xx" | `dislikes += 'xx'` |
| 用户连点"停止生成" ≥3 次 | `habits.stopGenerationRate↑` → 触发建议将 `replyStyle` 调为 `concise` |

#### （3）消费通道（如何进入 prompt）

- 由 [MemoryPolicyPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/MemoryPolicyPlugin.ts) 在每次请求前，把 `UserProfile` 压缩成 `<200 tokens` 的固定 section 注入 `ctx.systemPrompt`：

  ```
  [User Preferences]
  Language: zh-CN, Tone: cute, ReplyStyle: concise
  Code: TypeScript / React / 2-space indent, comments in zh
  Dislikes: 冗长的说明, jQuery
  Active hours: mostly 22:00-01:00
  ```

- 关键守则：
  - **上限 token 硬截断**（默认 200），超过则按"显式偏好 > 硬身份 > 习惯 > notes"顺序截取
  - **对话中禁止修改 profile**：LLM 只读，写入永远走中间件/UI，防止 prompt 注入被改画像
  - **可关闭**：Profile 里若 `enabled=false`，MemoryPolicyPlugin 跳过注入
  - **可解释**：每一条 preference 都带 `source` 与 `updatedAt`，UI 可展示"为什么记住这个"

#### （4）存储与安全

- 位置：`app.getPath('userData')/memory/user_profile.json`（由 [FileSessionStorePlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/FileSessionStorePlugin.ts) 同侧管理）
- 加密：仅当包含 `identity.displayName` 或用户勾选"敏感"时，走 `electron.safeStorage` 加密
- 导出/导入：Settings 中提供 JSON 导出、导入、一键清空
- 版本迁移：`version` 字段 + [migrate.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference/migrate.ts) 做 schema 演进
- 隐私：默认**不**上传远端；只在用户显式勾选"云同步"时走独立通道（后续 Phase）

#### （5）Seam 定义（供 SDK / UI 消费）

```typescript
// packages/bundle-ig-base/src/seams/userProfile.ts
export interface UserProfileService {
  get(): UserProfile;
  set(patch: DeepPartial<UserProfile>, source: 'user' | 'inferred'): Promise<void>;
  reset(scope?: 'preferences' | 'habits' | 'all'): Promise<void>;
  subscribe(fn: (p: UserProfile) => void): () => void;
  export(): string;
  import(json: string): Promise<void>;
}
export const UserProfileKey = defineService<UserProfileService>('ctx.userProfile');
```

对应门面：[MemoryFacade.userProfile.\*](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/MemoryFacade.ts)（get/set/reset/subscribe/export/import），并在 [ai-sdk-client](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client) 中自动生成对应 IPC 通道 `ai:userProfile:*`。

#### （6）新增插件在 bundle 中的落位

在 [bundle-ig-base](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins) 下新增 `preference/` 目录：

```
packages/bundle-ig-base/src/plugins/preference/
├── UserProfileStorePlugin.ts          注册 ctx.userProfile seam，负责读写/迁移/加密
├── PreferenceExtractor.ts             规则中间件：订阅 session/user-message，做正则匹配
├── PreferenceDistiller.ts             每 N 轮或 session 结束跑 LLM 蒸馏（JSON schema 输出）
├── HabitStatCollector.ts              订阅 agent/turn-*、tools/*、UI 事件更新 habits
└── migrate.ts                         version 迁移
```

并把 UserProfile section 注入逻辑追加到既有的 [MemoryPolicyPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/MemoryPolicyPlugin.ts) 里（不再单独注入一条 system message，避免重复）。

#### （7）默认工具补充

给模型开放两个**只读**工具（默认关闭写入工具，避免注入攻击）：

| Tool | 输入 | 输出 | 用途 |
|---|---|---|---|
| `user_profile_read` | `{ path?: string }` | JSON | 让模型在必要时主动查看某项偏好，避免全塞进 prompt |
| `user_profile_suggest_update` | `{ patch, reason }` | `{ok, needConfirm}` | 模型"建议"更新画像，实际写入需 UI 二次确认（DangerConfirm 拦截） |

### 6.4 Guardrails 守护

| 规则 | 触发 |
|---|---|
| MaxSteps | step > N 时强制 Final |
| Timeout | 超时中断并汇总当前进度 |
| RepeatCall | 同工具同参数连续 3 次 → 中断 |
| ToolWhitelist | 未授权工具直接拒绝 |
| RateLimit | 每分钟工具调用上限 |
| DangerConfirm | 破坏性工具（写文件/发命令）需 UI 二次确认 |

---

## 7. 工具集（v1）

| Tool | 输入 | 输出 | 来源 |
|---|---|---|---|
| `live2d_play_motion` | `{motion:string}` | ok | MCPBridge |
| `live2d_set_expression` | `{expression:string}` | ok | MCPBridge |
| `tts_speak` | `{text:string, voice?:string}` | 播放中 | TTSService |
| `asr_transcribe` | `{audio:Buffer}` | `{text:string}` | ASRService |
| `vision_analyze` | `{image, prompt}` | `{content:string}` | VisionService |
| `image_generate` | `{prompt, size?}` | `{url:string}` | ImageGenService |
| `capture_screen` | `{region?:'full'\|'window'}` | `{filepath:string}` | CaptureService |
| `clipboard_read` | `{}` | `{text?, image?}` | ClipboardService |
| `read_file` | `{path:string}` | `{content:string}` | 主进程 fs |
| `list_dir` | `{path:string}` | `{entries:string[]}` | 主进程 fs |
| `get_time` | `{}` | `{iso:string}` | 内置 |
| `search_history` | `{query:string}` | `{messages:[]}` | ChatHistory |

工具 schema 遵循 JSON Schema，Registry 自动导出给 LLM tools 参数。

---

## 8. IPC 通道设计

> 本章通道由 `ai-runtime` 通过 `registerIpcHandlers()` 自动导出，`ai-sdk-client` 的 `ClientAIClient` 通过 preload 暴露的 `window.aiChatAPI` / `window.waifuAPI` 一一对应订阅。三端消费方无需手写 IPC 桥接代码。

### 8.1 通道命名规范

```
ai-chat:<modality>:<action>          → invoke 单次
ai-chat:<modality>:<action>:stream   → 流式（webContents.send）
ai-chat:agent:run                    → 启动 Agent 任务
ai-chat:agent:event                  → Agent 步骤事件（推）
ai-chat:agent:cancel                 → 中断任务
ai-chat:provider:list|add|update|remove|test
ai-chat:active:get|set
ai-chat:capture:screen|clipboard|microphone
ai-chat:wakeword:start|stop|event
```

### 8.2 关键通道详情

| 通道 | 请求 | 响应 |
|---|---|---|
| `ai-chat:llm:chat` | `LLMRequest` | `LLMResponse` |
| `ai-chat:llm:stream` | `{reqId, LLMRequest}` | 推送 `{reqId, LLMStreamChunk}` |
| `ai-chat:asr:transcribe` | `ASRRequest` | `ASRResult` |
| `ai-chat:asr:stream:start` | `{reqId, opts}` | ok；后续推送 `ASRStreamChunk` |
| `ai-chat:asr:stream:feed` | `{reqId, chunk}` | ack |
| `ai-chat:asr:stream:stop` | `{reqId}` | final |
| `ai-chat:tts:synthesize` | `TTSRequest` | `TTSResult` |
| `ai-chat:tts:stream` | `TTSRequest` | 推送 `TTSStreamChunk` |
| `ai-chat:vision:analyze` | `VisionRequest` | `VisionResult` |
| `ai-chat:imageGen:generate` | `ImageGenRequest` | `ImageGenResult` |
| `ai-chat:agent:run` | `AgentTask` | ok；后续推送 `AgentEvent` |
| `ai-chat:capture:screen` | `{region?}` | `{filepath, base64}` |
| `ai-chat:clipboard:read` | `{}` | `{text?, image?}` |
| `ai-chat:wakeword:start` | `{keyword}` | ok；后续 event |

### 8.3 preload 暴露示例

```typescript
// ai-chat-preload.ts (片段)
contextBridge.exposeInMainWorld('aiChatAPI', {
  llm: {
    chat: (req) => ipcRenderer.invoke('ai-chat:llm:chat', req),
    stream: (req, onChunk) => { /* 桥接 reqId */ },
  },
  asr: { transcribe, streamStart, streamFeed, streamStop },
  tts: { synthesize, stream },
  vision: { analyze },
  imageGen: { generate },
  agent: {
    run: (task, onEvent) => { /* 通道 + 事件订阅 */ },
    cancel: (id) => ipcRenderer.invoke('ai-chat:agent:cancel', id),
  },
  provider: { list, add, update, remove, test, setActive, getActive },
  capture: { screen, clipboard },
  wakeWord: { start, stop, onDetected },
});
```

---

## 9. 多模态交互能力（全量）

### 9.1 麦克风输入

- 渲染进程使用 `MediaRecorder` API 录音（webm/opus）
- `MessageInput` 增加两种模式：
  - **按住说话**（PTT）：鼠标按下开始录，松开转 ASR
  - **VAD 自动**：静音检测自动断句
- 录音结束 → 走 `asr:transcribe` → 填入输入框（可编辑再发送）

### 9.2 唤醒词

- 主进程 `WakeWordService` 启动后台监听
- 引擎选择：
  - **Porcupine**（准确率高，需 access key）
  - **本地 ASR 轮询**（用小模型做关键词匹配，简单可控）
- 唤醒后触发 `wakeword:event` → 前端切换到"聆听"模式并弹出对话
- 看板娘同步"转头"动作

### 9.3 抓屏

- 快捷键（默认 `Alt+Shift+S`）触发 `capture:screen`
- 使用 `desktopCapturer.getSources` 或 `screen` API
- 支持全屏 / 指定窗口 / 拖拽选区（选区在渲染进程实现）
- 截图暂存到 `userData/captures/*.png`，返回 filepath+base64
- 自动作为图片附件送入 Vision 或 Agent

### 9.4 剪贴板

- `ClipboardService` 使用 `clipboard.readImage()` / `readText()`
- **主动模式**：快捷键 `Alt+V` 把剪贴板内容塞给 AI
- **被动模式**（可选）：轮询变更 → 检测到新截图 → toast 提示"要让 AI 看看吗？"

### 9.5 图片附件

- `MessageInput` 支持 **拖拽 + 粘贴 + 选择文件**
- 图片走 `vision.analyze`（普通模式）或作为 `attachments.images` 送入 Agent
- `MessageList` 用 `ImageAttachment` 组件缩略图渲染，点击查看大图

### 9.6 朗读输出

- `MessageBubble` 增加 🔊 按钮 → 走 `tts.synthesize`
- Agent 可通过 `tts_speak` 主动朗读
- 播放时联动 Live2D 张嘴动画（用 TTS visemes 或简易口型）

---

## 10. UI 设计要点

### 10.1 ConfigPanel（配置面板）

- **顶部 query button 切换**（避免 tab，符合用户偏好）：
  `[对话] [识别] [合成] [识图] [绘图] [Agent] [交互]`
- 每模态页面：
  - 顶部：**当前激活 provider** 快切下拉 + "测试" 按钮
  - 中部：provider 卡片列表（本地/远端分组，可添加/编辑/删除/启停）
  - 底部：**降级链** 排序（拖拽）
- Provider 编辑弹窗：**居中模态**（符合用户偏好，无动画，遮罩不关闭）
- 输入字段：**失焦格式化，实时输入**（符合用户偏好）

### 10.2 MessageInput

```
┌────────────────────────────────────────────────┐
│  [+图片] [🎤麦] [📎抓屏] [📋剪贴板]              │
│  ┌──────────────────────────────────────────┐  │
│  │ 输入内容...                              │  │
│  └──────────────────────────────────────────┘  │
│  [🤖Agent 模式] [模型: gpt-4o▼]        [发送]   │
└────────────────────────────────────────────────┘
```

### 10.3 MessageList / AgentStepView

Agent 消息渲染为可折叠链：

```
🤖 助手
  ▼ 思考过程 (3 步, 2.4s)  [默认折叠]
     ├ 💭 用户想读文件并触发动作，先读文件
     ├ 🔧 read_file({path:"AIService.ts"}) → 展开可看结果
     └ 🔧 live2d_play_motion({type:"happy"}) → ok
  ─────────────────────────
  sendMessage 通过适配器发送...并且我已经让看板娘开心啦！
  [🔊 朗读] [📋 复制] [🔁 重新生成]
```

- **停止生成**：追加灰色小字"已停止生成"（符合用户偏好，若已有内容不追加）
- **多模态消息**：图片缩略图/音频波形/生成图片按用户偏好用**下载原图**

### 10.4 ProviderPicker（顶部快切条）

在对话窗口顶部 1 行显示当前 5 模态激活的 provider，可点击快速切换，避免频繁进配置。

---

## 11. 安全与权限

| 项 | 策略 |
|---|---|
| apiKey 存储 | 主进程 `safeStorage.encryptString`，落盘 `userData/keys.enc` |
| apiKey 传输 | UI 只发 `providerId + updates`，key 不返回到渲染进程 |
| macOS 权限 | 麦克风、屏幕录制、辅助功能，首启动引导 |
| Windows 权限 | 麦克风、通知，安装时申请 |
| 工具白名单 | 默认开启只读工具；写文件/命令类工具默认关闭 |
| 敏感词过滤 | LLM 输入输出走可插拔过滤器（可选） |
| 网络代理 | 支持在 provider 配置中填 proxy（企业环境常见） |
| 日志脱敏 | LoggerService 自动打码 `apikey|token|bearer` |

---

## 12. 各家远端 API 差异对照

### 12.1 LLM

| Provider | 协议 | 认证 | tool_call | 流式 | 多模态 | 备注 |
|---|---|---|---|---|---|---|
| OpenAI | OAI | Bearer | ✅ | SSE | ✅ | 兼容基类 |
| DeepSeek | OAI 兼容 | Bearer | ✅ | SSE | ❌ | 复用基类 |
| Ollama | 自有 | 无 | ✅（新版） | SSE | ✅（部分） | localhost:11434 |
| llama.cpp | OAI 兼容 | 无 | ⚠️取决模型 | SSE | ⚠️ | server 模式 |
| Claude | Anthropic | x-api-key | ✅ | SSE | ✅ | messages API |
| Gemini | Google | key/query | ✅ | SSE | ✅ | generativelanguage |
| 通义(Qwen) | DashScope | Bearer | ✅ | SSE | ✅ | 或 OAI 兼容端点 |
| 豆包(Doubao) | 火山方舟 | Bearer | ✅ | SSE | ✅ | endpoint_id 概念 |

### 12.2 ASR

| Provider | 协议 | 流式 | 备注 |
|---|---|---|---|
| whisper.cpp | 子进程 | ❌ | 本地，需下载 ggml 模型 |
| OpenAI Whisper | REST | ❌ | audio/transcriptions |
| Azure Speech | WebSocket | ✅ | 需 region+key |
| 火山 ASR | WebSocket | ✅ | 双向流协议 |
| 讯飞 | WebSocket | ✅ | appid+key+签名 |
| 阿里云 NLS | WebSocket | ✅ | token 管理 |

### 12.3 TTS

| Provider | 协议 | 流式 | 音色 | 备注 |
|---|---|---|---|---|
| SystemTTS | 本地进程 | 边说边播 | 系统音色 | 桥接现有 |
| Edge-TTS | WebSocket | ✅ | 数百 | 免费 |
| OpenAI TTS | REST | ✅ | 6 | audio/speech |
| Azure TTS | WebSocket/REST | ✅ | 500+ | SSML 强 |
| ElevenLabs | REST/WS | ✅ | 克隆 | 高质量 |
| 火山 TTS | WebSocket | ✅ | 情感克隆 | 支持双向流 |
| 阿里云 | WebSocket | ✅ | 多语种 | |

### 12.4 Vision / ImageGen 略（参见 §3.1）

---

## 13. 数据存储

```
userData/
├── ai-chat/
│   ├── config.json                     AppConfig（不含 apiKey）
│   ├── keys.enc                        加密后的 apiKey 集合
│   ├── sessions/
│   │   └── <sessionId>.json           对话历史
│   ├── memory/
│   │   ├── facts.json                  长期事实（L4）
│   │   ├── user_profile.json           ⭐ 用户偏好薄层记忆（L3，见 §6.3.1）
│   │   └── summaries/<sessionId>.txt   会话摘要
│   └── captures/                       抓屏与生成图片
├── models/
│   ├── whisper/ggml-base.zh.bin       本地 ASR 模型
│   └── porcupine/*.ppn                唤醒词模型
```

---

## 14. 实施路线图（按分层模型从低到高拆分）

> **拆分原则**：严格沿用 §3.0.6 的分层依赖模型 —— **L0 dsh 基座 → L0.5 Bundle 插件 → L1 SDK 门面 → L2 Runtime → L3 Client → L4 消费方 → L5 打磨**。下层必须完全交付后上层才能启动；每个 Plan 的**准入前提 / 交付物 / 退出准则**都独立可验证，方便并行分工与回归。

### 全景总览

| Plan | 层级 | 名称 | 依赖 Plan | 关键包 / 目录 |
|---|---|---|---|---|
| **P0** | L-1 | 工程底座与骨架 | — | `pnpm-workspace.yaml`、`turbo.json`、`tsconfig.base.json` |
| **P1** | L0 | dsh 基座接入 | P0 | `@deepseek-ai/dsh`（npm 依赖）+ [profiles/](file:///Users/botycookie/self/ai-live2d-client/profiles) |
| **P2** | L0.5 | Bundle 通用能力 | P1 | [bundle-ig-base](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base) |
| **P3** | L0.5 | Bundle Electron 能力 | P2 | [bundle-ig-electron-caps](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps) |
| **P4** | L0.5 | Bundle 看板娘能力 | P2 | [bundle-ig-live2d](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d) |
| **P5** | L1 | ai-sdk 业务门面 | P2 | [packages/ai-sdk](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk) |
| **P6** | L2 | ai-runtime 主进程运行时 | P3 + P5 | [packages/ai-runtime](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime) |
| **P7** | L3 | ai-sdk-client 渲染薄层 | P5 + P6 | [packages/ai-sdk-client](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client) |
| **P8** | L4 | 三端消费方接入 | P4 + P7 | [ai-chat](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat) / [renderer](file:///Users/botycookie/self/ai-live2d-client/packages/renderer) / [electron](file:///Users/botycookie/self/ai-live2d-client/packages/electron) |
| **P9** | L5 | 打磨、观测、发布 | P8 | 全仓库 |

依赖关系（可并行）：`P0 → P1 → P2 → { P3, P4, P5 } → P6 → P7 → P8 → P9`。其中 **P3 / P4 / P5 三者可并行**；P2 完成后 P4/P5 可与 P3 并行推进。

---

### P0 · 工程底座与骨架（L-1，前置）

**准入前提**：无。
**目标**：把 monorepo 骨架、构建管线、Lint/Test 基础打好，让后续每个 Plan 都能"新建包即可跑"。

| # | 任务 | 交付物 |
|---|---|---|
| P0-1 | 规范 `pnpm-workspace.yaml`、锁定 Node / pnpm / Turbo 版本 | 根目录 `.npmrc` + `engines` |
| P0-2 | 抽 `tsconfig.base.json` / `tsup.base.ts` / `vitest.base.ts` | 复用配置 |
| P0-3 | 配 `turbo.json` pipeline：`build → test → lint → typecheck` 拓扑执行 | Turbo 缓存生效 |
| P0-4 | 配 ESLint + Prettier + husky pre-commit | 提交自动校验 |
| P0-5 | CI（GitHub Actions）：pnpm install / turbo run build test | PR 自动跑通 |

**退出准则**：`pnpm i && pnpm turbo run build` 全绿；CI 首次通过。

---

### P1 · L0 · dsh 基座接入（无本地代码）

**准入前提**：P0 完成。
**目标**：把 `@deepseek-ai/dsh` 作为唯一 AI 内核锁进项目，并跑通 3 份 profile 的空装配。

| # | 任务 | 交付物 |
|---|---|---|
| P1-1 | 根 `package.json` 加 `@deepseek-ai/dsh@^0.1.2-alpha.2`，锁 pnpm-lock | 依赖树可复现 |
| P1-2 | 新建 [profiles/waifu.yml](file:///Users/botycookie/self/ai-live2d-client/profiles/waifu.yml) / [chat-only.yml](file:///Users/botycookie/self/ai-live2d-client/profiles/chat-only.yml) / [mcp-headless.yml](file:///Users/botycookie/self/ai-live2d-client/profiles/mcp-headless.yml)（仅列 `dsh-base`，暂不含本项目 bundle） | 3 个 profile 骨架 |
| P1-3 | 写 `scripts/dsh-doctor.ts`：`pnpm doctor waifu` → 打印装配后的 ctx 服务清单 | 命令可跑，输出 `ctx.llm/tools/sessions/agents/systemPrompt` |
| P1-4 | 冒烟测试：用 dsh 内置 `echo` provider 走完一次 turn / step | Vitest 单测通过 |
| P1-5 | 文档：README 章节"dsh 升级流程"（CI 冒烟 → 升版本 → 回归） | 升级 SOP |

**退出准则**：`pnpm doctor waifu` 输出非空且事件流可追溯；dsh 版本被 CI 冻结。

---

### P2 · L0.5 · Bundle 通用能力（跨环境）

**准入前提**：P1 完成。
**目标**：交付 [bundle-ig-base](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base)，把 LLM / 工具 / 记忆 / MCP / 护栏这套"跨环境通用"的插件全部落到 dsh 生态。

| # | 任务 | 交付物 |
|---|---|---|
| P2-1 | 创建包骨架 + `package.json.dsh.bundle` 字段 + `patch.yml` | 可被 `boot` 识别 |
| P2-2 | [LLMProvidersPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/LLMProvidersPlugin.ts)：OpenAI / DeepSeek / Ollama / llama.cpp / Claude / Gemini / Qwen / Doubao | 8 个 provider 挂 `ctx.llm` |
| P2-3 | [ToolsBuiltinPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/ToolsBuiltinPlugin.ts)：`time_now / random / echo / http_get_readonly` | 4 个内置 Tool |
| P2-4 | [GuardrailsPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/GuardrailsPlugin.ts)：白名单 / RateLimit / DangerConfirm / RepeatCall / Timeout | 拦截器全量 |
| P2-5 | [McpBridgePlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/McpBridgePlugin.ts) + [seams/mcp.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/seams/mcp.ts) | 桥接外部 MCP Server |
| P2-6 | [MemoryPolicyPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/MemoryPolicyPlugin.ts)：L2 摘要 + L4 facts 注入 `ctx.systemPrompt` | section 编排就绪 |
| P2-7 | **用户偏好薄层记忆**（对齐 §6.3.1）：新增 [preference/](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/preference)：`UserProfileStorePlugin` / `PreferenceExtractor` / `PreferenceDistiller` / `HabitStatCollector` / `migrate.ts` + [seams/userProfile.ts](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/seams/userProfile.ts) | L3 记忆闭环 |
| P2-8 | 单元测试：mock ctx + 每个 plugin 独立 spec | 覆盖率 ≥ 80% |

**退出准则**：`waifu.yml` 追加 `@ig-live/bundle-ig-base` 后，`ctx.llm.list()` 返回 8 项、`ctx.tools.list()` 返回内置工具、`ctx.userProfile.get()` 返回默认 profile。

---

### P3 · L0.5 · Bundle Electron 能力（主进程侧）

**准入前提**：P2 完成。**可与 P4、P5 并行。**
**目标**：把只在 Electron 主进程才有的能力（本地文件、safeStorage、屏幕、剪贴板、系统 TTS/ASR、全局快捷键、唤醒词）打包为 dsh bundle。

| # | 任务 | 交付物 |
|---|---|---|
| P3-1 | 包骨架 + `patch.yml` | 可 `boot` |
| P3-2 | [SafeKeyStorePlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/SafeKeyStorePlugin.ts) + [FileSessionStorePlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/FileSessionStorePlugin.ts) | apiKey 加密落盘 / 会话 JSONL |
| P3-3 | [ScreenSeamPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/ScreenSeamPlugin.ts) + [ClipboardSeamPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/ClipboardSeamPlugin.ts) | `ctx.screen` / `ctx.clipboard` |
| P3-4 | [AsrPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/AsrPlugin.ts)：WhisperLocal / OpenAI Whisper / 火山 ASR + `ctx.asr` seam | 3 provider |
| P3-5 | [TtsPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/TtsPlugin.ts)：System TTS / Edge-TTS / OpenAI TTS / Azure TTS + `ctx.tts` seam | 4 provider |
| P3-6 | [WakeWordPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/WakeWordPlugin.ts)（Porcupine，可关） + [ShortcutPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-electron-caps/src/plugins/ShortcutPlugin.ts) | 唤醒 / 快捷键 |
| P3-7 | 单元 + Electron 集成测试（`@electron/mocha`） | 主进程可跑通 |

**退出准则**：`chat-only.yml` 加载后 `ctx.asr.list()` / `ctx.tts.list()` 齐全，`ctx.screen.capture()` 能返回 buffer；apiKey 加解密验证通过。

---

### P4 · L0.5 · Bundle 看板娘能力（渲染进程侧）

**准入前提**：P2 完成。**可与 P3、P5 并行。**
**目标**：把 Live2D 相关能力封成 dsh bundle，只在渲染进程加载。

| # | 任务 | 交付物 |
|---|---|---|
| P4-1 | 包骨架 + `patch.yml` | 可 `boot` |
| P4-2 | [Live2dSeamPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/Live2dSeamPlugin.ts)：`playMotion / setExpression / driveLipSync(rms)` + `ctx.live2d` seam | 渲染实现 |
| P4-3 | [TouchInjectPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/TouchInjectPlugin.ts)：Live2D 触摸 → `ctx.agents.inject(sensory part)` | 触摸感知 |
| P4-4 | [TtsLipSyncPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/TtsLipSyncPlugin.ts)：订阅 `tts:chunk` → 嘴型 | 联动就绪 |
| P4-5 | [WaifuAgentPresetPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/WaifuAgentPresetPlugin.ts) + [WaifuToolsPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-live2d/src/plugins/WaifuToolsPlugin.ts)：`live2d_play_motion` / `live2d_set_expression` | 看板娘 agent + 工具 |
| P4-6 | 渲染端单测（jsdom + 假 canvas） | 覆盖率达标 |

**退出准则**：`waifu.yml` 加载后 `ctx.live2d.playMotion('idle')` 有反馈；工具在 `ctx.tools.list()` 中可见。

---

### P5 · L1 · ai-sdk 业务门面（环境无关）

**准入前提**：P2 完成（可与 P3、P4 并行）。
**目标**：交付 [AIClient](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/AIClient.ts) 及各 Facade —— 屏蔽 dsh 表面变动，对上暴露稳定 API。

| # | 任务 | 交付物 |
|---|---|---|
| P5-1 | 包骨架（tsup 双出 esm/cjs），`peerDependencies: @deepseek-ai/dsh, @ig-live/bundle-ig-base` | 可发布 |
| P5-2 | [types/](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/types)：Message / Session / ToolSpec / MemoryFact / **UserProfile**（§6.3.1）/ events | 跨端 DTO 定稿 |
| P5-3 | [AIClient](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/AIClient.ts)：接收 dsh `Context`，组合各 Facade | 门面稳定 |
| P5-4 | Facade 全量：Chat / Session / Tools / Memory（含 `userProfile.*`）/ Asr / Tts / Live2d | 6 个 Facade |
| P5-5 | [config/validators.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/config/validators.ts)：zod schema 校验 AppConfig | 参数护栏 |
| P5-6 | 集成测试：用 dsh testing utility 构造 mock ctx，跑通 sendMessage / stream / abort | 全绿 |

**退出准则**：`new AIClient(ctx).chat.sendMessage(...)` 端到端流式返回；`aiClient.memory.userProfile.set(...)` 可持久化。

---

### P6 · L2 · ai-runtime 主进程运行时

**准入前提**：P3 + P5 完成。
**目标**：在 Electron 主进程装配 dsh + Bundle + AIClient，并把能力通过 IPC 桥出去。

| # | 任务 | 交付物 |
|---|---|---|
| P6-1 | 包骨架（仅 Electron 主进程用） | 可发布 |
| P6-2 | [AIRuntimeService](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/AIRuntimeService.ts)：`boot('waifu')` → `AIClient` 全局单例 + 生命周期钩子 | app 启停可控 |
| P6-3 | [IPCTransportServer](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/IPCTransportServer.ts)：反射 AIClient 全 API → `ai:*` 通道 | 自动导出通道 |
| P6-4 | [EventBroadcaster](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/EventBroadcaster.ts)：主进程事件 → 全部渲染窗口 | 多窗口一致 |
| P6-5 | 挂 P3 的 `ctx.screen / clipboard / asr / tts / userProfile` IPC handler | 主进程能力可用 |
| P6-6 | 与 [AiChatIpcHandler](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/handlers/ipc/AiChatIpcHandler.ts) 的兼容适配层：旧通道保留 + 新通道并行 | 平滑迁移 |
| P6-7 | 集成测试：playwright-electron 跑 send/receive | 端到端通 |

**退出准则**：Electron 启动后主进程日志有 `dsh booted (waifu)`；渲染窗口能通过 IPC 收发消息。

---

### P7 · L3 · ai-sdk-client 渲染薄层

**准入前提**：P5 + P6 完成。
**目标**：给渲染进程一层零业务代码的客户端 —— IPC Proxy + React Hooks + 事件订阅。

| # | 任务 | 交付物 |
|---|---|---|
| P7-1 | 包骨架（React 19 + TS，仅渲染进程） | 可发布 |
| P7-2 | [ClientAIClient](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/ClientAIClient.ts)：与 [AIClient](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/AIClient.ts) 同签名的 IPC Proxy | 类型完全一致 |
| P7-3 | [AIProvider](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/AIProvider.tsx) + hooks：`useChat / useAgent / useAIEvents / useTTSLipSync / useUserProfile` | 5 个 hook |
| P7-4 | preload 脚本模板（`window.aiChatAPI` / `window.waifuAPI`），contextBridge 白名单 | 可复用 |
| P7-5 | Storybook 或 example 应用演示 hooks | 可视化验证 |

**退出准则**：example 页面加载后能实时收发消息；`useUserProfile()` 可读写偏好。

---

### P8 · L4 · 三端消费方接入

**准入前提**：P4 + P7 完成。
**目标**：把 ai-chat / renderer / electron 主进程三个消费方全部切到新 SDK，删除旧硬编码。

| # | 任务 | 交付物 |
|---|---|---|
| P8-1 | [ai-chat](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat)：删除 [AIService](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/services/AIService.ts) 与 [AdapterFactory](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat/src/services/adapters/AdapterFactory.ts)，全面切换到 `useChat / useAgent / useUserProfile` | 无历史死代码 |
| P8-2 | [renderer](file:///Users/botycookie/self/ai-live2d-client/packages/renderer)：挂载 bundle-ig-live2d，接入 `useWaifuAgent` + `useTTSLipSync` | 看板娘可发起 agent |
| P8-3 | [electron 主进程](file:///Users/botycookie/self/ai-live2d-client/packages/electron)：在 `app.whenReady` 里初始化 `AIRuntimeService.boot('waifu')`；旧 [AiChatIpcHandler](file:///Users/botycookie/self/ai-live2d-client/packages/electron/src/handlers/ipc/AiChatIpcHandler.ts) 迁移到 IPCTransportServer | 单入口 |
| P8-4 | UI 补齐：ConfigPanel 增加"用户偏好"面板（读写 `ctx.userProfile`）；ProviderPicker 顶部快切 | 用户可编辑画像 |
| P8-5 | 首次启动向导（下载本地模型、授权、测试连接） | 新用户可自助初始化 |

**退出准则**：三个消费方全部通过 IPC 与主进程共享同一份消息 / 记忆 / 偏好；PR diff 里无遗留 `AIService` / `AdapterFactory` 引用。

---

### P9 · L5 · 打磨、观测与发布

**准入前提**：P8 完成。
**目标**：让产品可交付。

| # | 任务 | 交付物 |
|---|---|---|
| P9-1 | 观测：接入 dsh `ctx.telemetry`，导出到本地 JSONL（默认不上云） | 可复盘 |
| P9-2 | 降级链自动化（provider 失败 → 备选） + Guardrails 全量回归 | 高可用 |
| P9-3 | 端到端场景测试（唤醒 → ASR → LLM → 工具 → TTS → 嘴型） | 一场景一 spec |
| P9-4 | 打包体积裁剪 / 首启动性能 / 冷启动埋点 | 首屏 < 3s |
| P9-5 | dsh 升级演练（跑 P1-5 的 SOP） + 发版 CI | 一键出包 |

**退出准则**：主要用户旅程 e2e 全绿；打包产物可分发。

---

### 迭代节奏建议

| Sprint | 时长 | 承接的 Plan |
|---|---|---|
| Sprint 0 | 1 周 | **P0 + P1** |
| Sprint 1 | 1~2 周 | **P2**（单人） |
| Sprint 2 | 2~3 周 | **P3、P4、P5 并行** |
| Sprint 3 | 1 周 | **P6** |
| Sprint 4 | 1 周 | **P7** |
| Sprint 5 | 1~2 周 | **P8** |
| Sprint 6 | 持续 | **P9** |

---

## 15. 风险与假设

| 风险 | 缓解 |
|---|---|
| 各家 API 频繁变更 | provider 独立、有兼容基类；测试连接工具兜底 |
| 本地模型资源占用大 | 首启动向导按需下载；懒加载；提供轻量模型选项 |
| 系统权限拒绝（麦克风/屏幕） | 引导页明确提示；无权限时降级到"仅键盘+文本" |
| 唤醒词误触发/漏触发 | 引擎可切换；灵敏度可调；提供关闭开关 |
| Agent 死循环 | Guardrails 多重防护 |
| 上下文膨胀 | Memory 摘要 + token 预算控制 |
| macOS/Windows 双端 TTS 差异 | SystemTTS 统一包装，远端 provider 跨平台一致 |

---

## 16. 待用户确认清单

- [ ] 文档结构 / 分层设计是否符合预期？
- [ ] 目录结构（`modalities/` + `harness/` + `tools/`）是否 OK？
- [ ] Phase 1 交付范围是否合适？（约 40+ 文件、约需 1 轮完整开工）
- [ ] provider 名单是否覆盖需求？是否补充/删减？
- [ ] 交互能力（麦克风+唤醒词+抓屏+剪贴板）是否全都要 Phase 2 上齐？
- [ ] 是否用 Porcupine 做唤醒词（需 access key）还是自研 ASR 轮询？
- [ ] apiKey 存储方案（safeStorage 加密）是否可接受？
- [ ] UI 采用 **query button 切换** 5 模态是否符合你偏好？

评审确认后进入 **Phase 1** 实施。
