# 编程助手接入：监视升级、会话接管与供应商切换（设计稿）

> 状态：**P0 实现中 / 已批准**（2026-10-14）。
> 关联：现有 [编程助手监视](agent-monitor.md)、[供应商与 Token](providers.md)、[AI 对话](chat.md)。

## 1. 产品一句话

把 Nomi 的对话窗口做成 **Claude Code / Codex（及后续同类 CLI）的 UI 外壳**：消息、工具确认、权限与进度都转发到本机真实 CLI；同时提供 **版本检查与看板娘一键更新**，以及 **按工具独立切换 API 供应商**（含可选本机协议路由）。Nomi 自己的 AI 运行时仍保留为「Nomi 原生」后端，可随时切回。

## 2. 现状（代码事实）

| 能力         | 现状                                                                                                                          | 缺口                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 编程助手监视 | `AgentProgressService` 只读解析 `~/.claude`、`~/.codex`、Cursor 等本地会话 + 进程存活；日程面板「编程助手」标签展示与气泡提醒 | 无版本号、无安装路径、无更新动作                               |
| 对话后端     | 固定走 `AIClient` → `ai-runtime`（Vercel AI SDK + ProviderStore）                                                             | 无法把一轮对话交给外部 CLI                                     |
| 供应商       | Nomi 自己的 `ProviderStore`（safeStorage、任务路由、多 Key）                                                                  | 不写 `~/.claude/settings.json` / `~/.codex/config.toml`        |
| 本地模型     | 本机管理面板 + llama.cpp / Ollama 标签                                                                                        | 可作无云 Key 的联调，与 CLI `--oss` / 第三方 base URL 尚未打通 |

**设计原则（不可破）：**

1. **真实 CLI 做智能与工具** —— 接管模式下 Nomi 不复刻 Claude Code / Codex 的 agent loop，只做 UI + 进程桥 + 配置桥。
2. **最小改写配置** —— 供应商切换只替换连接字段（endpoint / key / model / 协议），保留用户自有 hooks、MCP、权限、注释。
3. **权限在工具侧** —— Bash / 写文件等确认优先走 CLI 自己的 permission 事件；Nomi 只渲染并回传用户选择。
4. **可回退** —— 任意时刻切回「Nomi 原生」；切换或更新失败不破坏原配置（先备份）。

## 3. 外部能力调研摘要（2026-10）

### 3.1 Claude Code（`@anthropic-ai/claude-code`，npm latest ≈ 2.1.299）

- **无界面可编程**：`claude -p`；流式用 `--output-format stream-json --verbose [--include-partial-messages]`；多轮 stdin 用 `--input-format stream-json`。
- **会话**：`--resume <sessionId|jsonl路径>` / `--continue`；会话落在 `~/.claude/projects/<cwd编码>/<id>.jsonl`（与现监视器一致）。
- **权限**：`--permission-mode`、`--allowedTools`、`--permission-prompts`；stream-json 可出现待确认事件，适合 UI 转发。
- **供应商环境**：官方与社区实践通过 `~/.claude/settings.json` 的 `env`（如 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`）热切换；Claude Code 支持热重载，一般**不必重启**。
- **更新**：`claude --version` / `claude doctor` / `claude update`；npm 安装用 `npm i -g @anthropic-ai/claude-code@latest`（勿用 `npm update -g`）。

推荐接管实现：**长期存活的 `claude -p --input-format stream-json --output-format stream-json --verbose` 子进程**，按会话绑定 cwd；权限回调映射到 Nomi 气泡 / 详情对话框。可选后续再评估官方 Agent SDK（TS/Python）作为同协议的替代宿主。

### 3.2 Codex CLI（`@openai/codex`，npm latest ≈ 0.162.1）

- **无界面**：`codex exec`（别名 `e`）+ `--json` → NDJSON（`thread.*` / `turn.*` / `item.*`）。
- **会话**：`codex exec resume [--last|--all] [SESSION_ID]`；磁盘 `~/.codex/sessions/.../rollout-*.jsonl`（监视器已解析新/旧格式）。
- **本地模型**：`--oss` + `--local-provider ollama|lmstudio` —— **无云 Key 联调的首选**。
- **配置**：`~/.codex/config.toml` + `auth.json`；切换供应商后多数情况需**重启终端 / daemon**。
- **更新**：`codex update`（发行版自更新）；另可用 npm / 官方安装器。

推荐接管实现：优先 **`codex exec --json` 单轮 + resume 续聊**（实现简单、事件模型清晰）；P1 再评估 `codex app-server`（stdio/WS）做真正的长连接 UI。

### 3.3 Cursor Agent CLI

- 存在 headless：`agent -p` / `--print`，`--output-format text|json|stream-json`，`--resume`。
- 鉴权偏 `CURSOR_API_KEY`；会话存储仍为私有 SQLite（监视器只靠 mtime + 进程）。
- **P0/P1 不纳入「完整接管」**，仅保留监视 + 版本检测；P2 再评估。

### 3.4 CLI 供应商与本地路由（Nomi 自建）

| 概念               | 含义                        | Nomi 实现                                                                                                   |
| ------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 按工具的供应商档案 | Claude / Codex 各自一组档案 | `userData/cli-providers/claude/store.json` 与 `…/codex/store.json`，与 Nomi 原生 ProviderStore **完全隔离** |
| 一键启用           | 只改连接字段，备份后写回    | 原子写 + `userData/cli-providers/backups/`                                                                  |
| Direct             | CLI 直连上游（原生协议）    | 默认：Claude=`anthropic_messages`；Codex=`openai_responses`                                                 |
| 本地路由           | 本机代理做协议转换          | `CliRouteService` 监听 `127.0.0.1:18721`；非原生格式须开启路由后才能启用档案                                |
| Aggregation        | 多上游模型列表合并          | **P2**                                                                                                      |
| Apps 页升级        | 检测版本、安装、升级        | 对标「版本与更新」章节，由看板娘执行                                                                        |

**上游格式（按 CLI 不同）：**

- **Claude Code**：原生 Anthropic Messages；OpenAI Chat Completions / Responses / Gemini 需本地路由转换。
- **Codex**：原生 OpenAI Responses；Chat Completions / Anthropic Messages 需本地路由转换。

**经本地路由接本机 Ollama（实测 2026-10）：**

- Ollama 默认上下文约 2k token，而 Claude Code 每轮系统提示 + 工具定义约 16k token，超出部分会被**静默截断**，表现为空回复或答非所问。
- 启动 Ollama 时设置 `OLLAMA_CONTEXT_LENGTH=20480`（或更大）：`OLLAMA_CONTEXT_LENGTH=20480 ollama serve`；Codex 的提示约 6k token，同样建议 ≥ 8192。
- 档案的 API 地址填 `http://127.0.0.1:11434/v1`，格式选 OpenAI Chat Completions，开启路由并接管对应 CLI。

## 4. 用户体验

### 4.1 对话窗口：后端切换器

在现有「供应商 / 模型」旁增加 **后端** 下拉：

| 后端             | 行为                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Nomi**（默认） | 现状：AIClient + 自有工具（知识库、记忆、桌面能力…）                                       |
| **Claude Code**  | 本会话所有用户消息 → Claude CLI；工具与权限 UI 显示 CLI 事件；Nomi 自有 agent 工具默认关闭 |
| **Codex**        | 同上，走 `codex exec`                                                                      |

附加控件：

- **工作目录**：默认当前项目（可浏览）；与 CLI `--cd` / 启动 cwd 一致。
- **接管已有会话**：从监视器列表选一条 Claude/Codex 会话 → `--resume` / `exec resume`，聊天区加载只读历史摘要 + 可续写。
- **CLI 供应商**：仅在 Claude/Codex 后端显示；切换即写对应配置（见 §5）。

看板娘：切换后端时短提示；CLI 报错 / 等待权限时气泡同步。

### 4.2 版本检查与更新（看板娘）

入口：日程 → 编程助手；托盘「编程助手」；Nomi 气泡「发现更新」。

对每个已检测工具卡片展示：`已安装版本` · `最新版本` · `安装方式`（npm / 原生 / homebrew / 未知）· `路径`。

操作：

1. **检查更新**（可定时，默认每天一次，可关）。
2. **更新** → 二次确认（显示将执行的命令）→ 主进程跑更新 → 进度与结果通过气泡 + 面板展示。
3. 失败保留日志路径；不自动 `sudo`。

版本源：优先 CLI 自带（`claude update` / `codex update` / `claude --version`）；否则 npm registry `latest`；Homebrew 提示用户在终端执行（Nomi 不静默改 brew）。

### 4.3 CLI 供应商切换与本地路由

设置或扩展面板 **「编程 CLI 供应商」**（对话区 `CliToolsBlock` 内嵌）：

- 分栏：Claude Code | Codex（P2：Gemini…）。
- 档案列表：名称、base URL、model、**上游格式**、启用态；Key 走 **同一套 safeStorage**，不入明文 JSON。
- 预设：Anthropic 官方、OpenAI 官方、OpenRouter、DeepSeek、硅基流动、自定义……（可从 Nomi 已有 presets 映射）。
- **启用**：备份 → 写 `~/.claude/settings.json` env 或 `~/.codex/config.toml` + auth 字段 → Claude 热生效；Codex 提示重启。
- **开启路由**：高级设置开关；开启后非原生格式档案可启用，CLI 配置写入本机路由地址与占位 Key，真实上游由路由转发并转换协议。
- **从 Nomi 导入**：把原生供应商的 baseURL/model/key 复制为 CLI 档案（用户确认）。

Aggregation（多上游合并）仍为 **P2**。

## 5. 架构

```
┌─ ai-chat ─────────────────────────────────────────────┐
│  BackendSwitcher │ CliProviderSwitcher │ Chat transcript │
│  PermissionCard  │ ToolCallTimeline（只读渲染 CLI 事件） │
└────────────┬──────────────────────────────────────────┘
             │ IPC  ai:harness:*  /  ai:cli-provider:*  /  ai:cli-update:*
┌────────────▼──────────────────────────────────────────┐
│ electron 主进程                                        │
│  CliHarnessService     子进程生命周期、stream 解析、会话表  │
│  CliProviderBridge     读写 ~/.claude / ~/.codex（原子+备份）│
│  CliUpdateService      which/version/latest/更新命令      │
│  AgentProgressService  现有监视（扩展 version 字段）       │
└────────────┬──────────────────────────────────────────┘
             │ spawn
     ┌───────┴────────┐
     │ claude -p …    │  codex exec --json …
     └────────────────┘
```

**进程模型：**

| 后端        | 进程策略                                               | 输入                   | 输出               |
| ----------- | ------------------------------------------------------ | ---------------------- | ------------------ |
| Claude Code | 每会话一个长子进程（cwd 固定）                         | stdin NDJSON user 消息 | stdout stream-json |
| Codex       | 每用户消息一次 `exec`（或 resume）；P1 可升 app-server | argv / stdin prompt    | stdout NDJSON      |
| Nomi        | 无外部进程                                             | —                      | AIClient 事件      |

**权限桥：** CLI 若发出「需确认」事件 → IPC → 对话区卡片 + 可选看板娘气泡 → 用户允许/拒绝 → 写回 CLI stdin / 专用 flag。超时与桌面能力一致（默认 120s 拒绝）。

**安全：**

- 子进程 `env` 显式构造；不把 Nomi 的全部 process.env 泄漏给 CLI（尤其是无关 Token）。
- 工作目录必须是用户选出的真实路径；拒绝 `..` 逃逸。
- 更新命令白名单：`claude update`、`npm install -g @anthropic-ai/claude-code@latest`、`codex update`、`npm install -g @openai/codex@latest`；禁止任意 shell 字符串。
- 写 `~/.claude` / `~/.codex` 前复制到 `userData/cli-providers/backups/<ts>/`。
- 接管模式关闭 Nomi 桌面写权限工具，避免双通道改同一仓库（开放问题可改为「询问」）。

## 6. 数据与迁移

| 数据                                      | 位置                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| 后端偏好、每会话 backend/cwd/cliSessionId | `userData/harness/sessions.json` + 对话元数据字段                              |
| CLI 供应商档案（无明文 key）              | `userData/cli-providers/claude/store.json`、`…/codex/store.json` + safeStorage |
| 配置备份                                  | `userData/cli-providers/backups/`                                              |
| 本地路由设置                              | `userData/cli-providers/routing.json`                                          |
| 更新缓存（latest 查询）                   | `userData/cli-update/cache.json`                                               |

迁移：无破坏性变更；首次打开 CLI 后端时引导「选择工作目录 + 检测 CLI 是否安装」。不自动修改用户全局 git / npm 配置。

## 7. 测试计划

| 层级               | 内容                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| 单元               | stream-json / NDJSON 解析；配置补丁；Claude/Codex **分店**；上游格式与路由开关；协议转换 transforms   |
| 集成（本地）       | **Mock CLI** 可执行文件（打印固定 NDJSON）—— CI 主路径                                                |
| 集成（本机有 CLI） | 真实 `claude` / `codex` smoke（需用户 Key 或登录）                                                    |
| **无云 Key**       | `codex exec --oss --local-provider ollama` + 本机 Ollama 模型；Nomi 原生后端继续用 Ollama / llama.cpp |
| E2E headed         | 后端切换器可见；选 Mock 后端发一条消息出现工具时间线；权限卡允许/拒绝                                 |
| 回归               | 监视器、Nomi 原生对话、ProviderStore 不受影响                                                         |

## 8. 里程碑建议

### P0 —— 可演示的「外壳 + 更新」（约 1.5–2.5 周）

1. `CliUpdateService`：检测 Claude Code / Codex / Cursor（能 which 到的）版本与 latest；面板 + 看板娘「更新」白名单命令。
2. 对话 **后端切换器**：Nomi | Claude Code | Codex。
3. Claude / Codex **新会话** 转发（Mock CLI 保证 CI；真实 CLI 手册验收）。
4. 权限/工具事件的最小 UI（列表 + 允许/拒绝）。
5. **CLI 供应商切换**（分店 Claude/Codex + 上游格式）+ 备份；**本地路由**（非原生格式）。
6. 设计文档定稿进 `docs/features/`（本文）；`agent-monitor.md` / `chat.md` 增加入口链接。

### P1 —— 接管与本地闭环（约 2–3 周）

1. 从监视器 **Resume 已有会话**。
2. Codex `--oss --local-provider ollama` 一键联调；文档化 Ollama 要求。
3. 流式 token / 工具时间线打磨；失败重试与「在终端打开」。
4. 路由故障转移 / 多上游；流式转换打磨。
5. Windows 路径 / 无登录体验。

### P2 —— 扩展（择优）

- Cursor `agent` 接管；Gemini CLI。
- Aggregation；用量展示；多会话并行。
- Claude Agent SDK 替换裸 spawn（若 CLI 协议不稳定）。

## 9. 明确不做（本阶段）

- 在 Nomi 内复刻 Claude Code / Codex 的完整 agent 运行时。
- 静默调用 `sudo` / 无人值守改系统目录。
- 把用户 CLI 的 OAuth 登录态上传或同步到云端。
- P0 实现多上游 Aggregation / 故障转移（本地直连转换已纳入）。
- 未批准前的任何功能实现提交。

## 10. 已拍板（2026-10-14）

1. **写配置前自动备份**（不依赖第三方工具检测）。
2. **登录**：仅 API Key / 已有登录态；**不在 Nomi 内做 OAuth**。
3. **CLI 模式**：禁用 **全部** Nomi 工具。
4. **默认后端**：保持 **Nomi**。
5. **更新范围**：**Claude Code + Codex**；Cursor **仅检测**。
6. **工作目录**：对话级绑定（P0 用全局 harness cwd + 选目录按钮）。
7. **三套供应商隔离**：Nomi `ai-providers.json`｜Claude CLI 档案｜Codex CLI 档案；各写各的路径。
8. **本地路由**：非原生上游格式须「开启路由」后才能启用。

## 11. 批准后的首个实现切片（仍等批准）

1. `CliUpdateService` + 面板只读版本行（无更新按钮也可先合入）。
2. Mock `claude`/`codex` + harness IPC + 后端下拉空壳。
3. 单测覆盖解析与配置补丁。

---

_调研来源：本仓库 `packages/electron/src/agents/*`、官方 Claude Code headless/CLI 文档、OpenAI Codex CLI reference、Cursor headless CLI 文档（2026-10）。_

## 12. 第三个接管端点：dsh + 多标签并发后端（设计稿，2026-10-15）

### 12.1 dsh 调研摘要（`@deepseek-ai/dsh`）

| 项目     | 事实（2026-10-15 实测）                                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm 版本 | `latest` / `next` = `0.2.0-rc.2`，`alpha` = `0.2.1-alpha.3`；bin 为 `dsh`                                                                                                                                                                                                        |
| 运行时   | **需要 Node ≥ 24**（使用 `import.meta.main`）；Node 22 下不报错、无输出、退出码 0，因此探测时要把「`--version` 无输出」视为运行时过旧                                                                                                                                            |
| 版本     | `dsh --version`                                                                                                                                                                                                                                                                  |
| 更新     | 无自更新命令，使用 `npm i -g @deepseek-ai/dsh@latest`；插件使用 `dsh plugin --profile <name> <pnpm 参数>` 管理                                                                                                                                                                   |
| 无头运行 | `dsh --profile headless --json [--session-id <id>] "<任务>"`；任务写 `-` 时从 stdin 读取                                                                                                                                                                                         |
| 事件流   | NDJSON：`session{sessionId,cwd}`、`status{phase:turn_start/step_start/step_end/turn_end, usage, reason}`、`text`、`thinking`、`tool_call{callId,tool,input}`、`tool_result{callId,status,result}`、`final{text}`、`error{message}`；文本按「已提交的步骤」整段输出，不是逐 token |
| 退出码   | 0 = 完成；1 = 中止或出错                                                                                                                                                                                                                                                         |
| 续接     | `--session-id session-<uuid>`；必须在同一 cwd 下运行，未知 id 会报错                                                                                                                                                                                                             |
| 其它模式 | `--profile acp`（stdio 上的 ACP）、`--profile sdk`（stdio JSON-RPC），留待 P2                                                                                                                                                                                                    |
| 配置根   | `DSH_HOME`（默认 `~/.dsh`）：`profiles/<name>/`、家目录级补丁 `cordis.patch.yml`、凭据 `.credentials.yaml`                                                                                                                                                                       |
| 会话存储 | `$DSH_HOME/sessions/<编码后的 cwd>/session-<uuid>/{session.lock, session.v4.jsonl.zstd}`；运行中的会话持有 `session.lock`                                                                                                                                                        |
| 供应商   | 默认使用 DeepSeek 官方接口（`DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`）；内置适配器原生支持 `openai-completions`、`openai-responses`、`anthropic-messages`，**不需要本地路由**                                                                                                    |

### 12.2 dsh 供应商档案（第 4 套档案库）

- 档案库位于 `userData/cli-providers/dsh/store.json`，与 Nomi / Claude / Codex 的档案相互隔离。
- 启用档案时，在 `$DSH_HOME/cordis.patch.yml` 中写入一段带 `# >>> nomi managed (dsh provider) >>>` 标记的区块，其余内容原样保留，并且先备份再原子写入：

```yaml
- id: llm-pi-ai
  config:
    providers:
      nomi:
        api: openai-completions # 或 openai-responses / anthropic-messages
        baseURL: https://example.com/v1
        apiKeyEnv: NOMI_DSH_API_KEY
        models:
          - id: <model>
- id: agent-default-model
  config:
    provider: nomi
    model: <model>
```

- **密钥不落盘到 dsh 配置**：由接管服务在启动 dsh 时注入环境变量 `NOMI_DSH_API_KEY`。用户在终端里自己运行 dsh 时，需要自行导出该变量，或停用档案、回到 dsh 默认供应商。
- 停用档案时只移除标记区块。

### 12.3 接管适配器

- 启动 `dsh --profile headless --json [--session-id <id>] <prompt>`，stdin 立即关闭，cwd 为会话目录。
- 事件映射：`text`/`final` → 文本；`tool_call` → 工具开始；`tool_result` → 工具完成或出错；`error`、`status.reason.kind=error` → 错误；`session.sessionId` 写回会话状态，供下一轮续接。
- 测试和 Mock 使用 `NOMI_DSH_BIN` 覆盖可执行文件，Mock 脚本为 `scripts/mock-cli/mock-dsh.mjs`。
- 版本检查和更新复用 `CliUpdateService`，类型为 `dsh`，安装方式固定为 npm。

### 12.4 多标签并发后端（已实现）

- **标签 = 会话**：每个标签绑定 `{backend, cliSessionId, cwd}`，互不阻塞。`CliHarnessService` 维护 `Map<tabId, 标签状态>`，每个标签同一时刻最多一个子进程。
- **Nomi 只在主标签**：主标签（`id = main`）即原有对话，后端可选 Nomi 或任一 CLI；新建的标签只能绑定 Claude Code / Codex / dsh。原因：Nomi 的对话历史、模型选择与工具状态由 `AiChatContext` 单例管理，只有一条「当前对话」，多个 Nomi 标签会互相覆盖；CLI 的会话由各自的 CLI 持久化，天然可多开。
- **并发上限**：全局信号量，默认 3（可调 1–8，`ai:harness:set-max-concurrent`）；超出的轮次状态为 `queued`，有空位时按先来先到开始运行。标签栏右侧显示「运行 x/上限 · 排队 n」。
- **状态与未读**：状态点 灰 = 空闲 · 蓝（脉动）= 运行中 · 黄 = 排队 · 红 = 出错 · 绿 = 有未读结果；标签不在前台（或窗口无焦点）时完成一轮，未读数 +1，切换过去即清零。关闭运行中的标签会先确认并终止子进程；切换后端或 cwd 会丢弃该标签的 `cliSessionId`。
- **快捷键**（Mod = macOS ⌘ / 其它 Ctrl，可在设置 → 快捷键改绑）：

  | 操作                     | 默认                      |
  | ------------------------ | ------------------------- |
  | 新建标签（弹出后端菜单） | Mod+T                     |
  | 关闭当前标签             | Mod+Shift+W               |
  | 下一个 / 上一个标签      | Ctrl+Tab / Ctrl+Shift+Tab |
  | 重命名当前标签           | Mod+Shift+R（或双击标签） |
  | 跳到第 1–9 个标签        | Mod+1 … Mod+9             |

  另外：中键关闭标签，标签获得焦点时 ←/→ 切换。

- **持久化**（均在 `userData/harness/` 下）：主标签 `session.json`（后端、cwd、会话、标题；消息仍走 Nomi 历史）；其它标签 `tabs.json`（`activeTabId`、`maxConcurrent`、标签元数据）与 `tabs/<tabId>.json`（消息，最多 300 条）。重启后被中断的运行回到空闲。
- **看板娘监视器**：一个列表聚合所有端点，按最近活动排序：
  - Claude Code：`~/.claude/projects/*/*.jsonl`
  - Codex：`~/.codex/sessions/**/rollout-*.jsonl`
  - dsh：`$DSH_HOME/storages/session_projcache/sessions/<id>.json` 取标题与 cwd；`session.lock` 运行结束后仍存在，所以「运行中」以内核 flock 是否被持有判断（Linux 读 `/proc/locks`，其它平台退回进程扫描 + 修改时间）。
  - Nomi 标签：实时状态优先于文件推断；由标签驱动的 CLI 会话不会在文件来源里重复出现。
  - 顶部按端点筛选（全部 / Nomi 标签 / dsh / Codex / Claude Code），标签条目有「打开标签」按钮直达。
- **提醒**：后台端点完成或需要处理时，看板娘说一句并做动作（成功挥手、失败思考），灵动岛显示带端点徽标与状态图标（完成 / 失败 / 需要处理 / 运行中）的事件。

### 12.5 普通 / 开发模式、端点隔离与分叉（HIGHLIGHT）

- **对话模式**（顶栏左侧「普通 | 开发」，默认普通，localStorage `ai-chat:chatMode`）：
  - **普通**：仅 Nomi。隐藏标签栏、后端切换器、Mod+T 等编程助手 chrome。后台 CLI 标签继续跑，模式控件显示「N 运行中」徽标；切回开发恢复标签栏与未读。
  - **开发**：完整 chrome。选中 / 新建非 Nomi 会话会打开或聚焦对应 CLI 标签；Nomi 会话始终走主标签 + nomi 后端。
- **会话归属**：每条 ConversationStore 元信息带 `backend: nomi|claude|codex|dsh` 与可选 `tabId`。旧行迁移为 `nomi`。侧栏列表不再混合身份——点 Nomi 只加载 Nomi；点 Claude 只聚焦该 Claude 标签。
- **CLI 标签进侧栏**：创建 / 重命名 / 关闭 / 消息时同步一条 ConversationStore 元信息（消息仍在 `userData/harness/tabs/<id>.json`）。删除侧栏项会关闭对应标签（运行中仍走原确认）。
- **切换后端**：有消息的会话不会静默改写身份。BackendSwitcher 会为新后端新建会话 / 标签；空会话可原地切换。跨端复制历史请用分叉。
- **侧栏视图**（「全部 | 按端」，持久化）：
  - 全部：所有会话 + 端点色标（与灵动岛一致：nomi 珊瑚 / claude 橙 / codex 蓝 / dsh 蓝紫）。
  - 按端：先选端点芯片（未安装的 CLI 禁用），再只看该端。
  - 「新对话」：普通 → 总是 Nomi；开发 + 按端 → 当前端；全部 → 弹出端点菜单。
- **分叉**（侧栏右键 / Mod+Shift+F）：
  1. **分叉为新对话**：同端复制可见消息，标题「原标题 (副本)」。
  2. **分叉到其他端**：选目标端；复制 user/assistant 文本（工具调用压成短注）。CLI 目标写入 seed 转录或 preface，**不声称跨 CLI resume**。
- **已知取舍**：主标签在开发模式下切到 CLI 会开新标签，避免 Nomi 历史被 CLI 污染；跨端分叉是上下文粘贴，不是会话续接。
- **示意**：见 [`assets/chat-mode/`](./assets/chat-mode/)（storyboard SVG；headed e2e 截图可替换）。
