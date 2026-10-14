# 编程助手接入：监视升级、会话接管与供应商切换（设计稿）

> 状态：**设计待审** —— 未实现。批准前不写代码。
> 关联：现有 [编程助手监视](agent-monitor.md)、[供应商与 Token](providers.md)、[AI 对话](chat.md)。

## 1. 产品一句话

把 Nomi 的对话窗口做成 **Claude Code / Codex（及后续同类 CLI）的 UI 外壳**：消息、工具确认、权限与进度都转发到本机真实 CLI；同时提供 **版本检查与看板娘一键更新**，以及类似 [cc-switch](https://github.com/farion1231/cc-switch) 的 **按工具切换 API 供应商**。Nomi 自己的 AI 运行时仍保留为「Nomi 原生」后端，可随时切回。

## 2. 现状（代码事实）

| 能力         | 现状                                                                                                                          | 缺口                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 编程助手监视 | `AgentProgressService` 只读解析 `~/.claude`、`~/.codex`、Cursor 等本地会话 + 进程存活；日程面板「编程助手」标签展示与气泡提醒 | 无版本号、无安装路径、无更新动作                               |
| 对话后端     | 固定走 `AIClient` → `ai-runtime`（Vercel AI SDK + ProviderStore）                                                             | 无法把一轮对话交给外部 CLI                                     |
| 供应商       | Nomi 自己的 `ProviderStore`（safeStorage、任务路由、多 Key）                                                                  | 不写 `~/.claude/settings.json` / `~/.codex/config.toml`        |
| 本地模型     | 本机管理面板 + llama.cpp / Ollama 标签                                                                                        | 可作无云 Key 的联调，与 CLI `--oss` / 第三方 base URL 尚未打通 |

**设计原则（不可破）：**

1. **真实 CLI 做智能与工具** —— 接管模式下 Nomi 不复刻 Claude Code / Codex 的 agent loop，只做 UI + 进程桥 + 配置桥。
2. **最小改写配置** —— 供应商切换只替换连接字段（endpoint / key / model / 协议），保留用户自有 hooks、MCP、权限、注释（对齐 cc-switch）。
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
- **配置**：`~/.codex/config.toml` + `auth.json`；切换供应商后多数情况需**重启终端 / daemon**（cc-switch 同样提醒）。
- **更新**：`codex update`（发行版自更新）；另可用 npm / 官方安装器。

推荐接管实现：优先 **`codex exec --json` 单轮 + resume 续聊**（实现简单、事件模型清晰）；P1 再评估 `codex app-server`（stdio/WS）做真正的长连接 UI。

### 3.3 Cursor Agent CLI

- 存在 headless：`agent -p` / `--print`，`--output-format text|json|stream-json`，`--resume`。
- 鉴权偏 `CURSOR_API_KEY`；会话存储仍为私有 SQLite（监视器只靠 mtime + 进程）。
- **P0/P1 不纳入「完整接管」**，仅保留监视 + 版本检测；P2 再评估。

### 3.4 cc-switch 语义（要对齐的行为，不是依赖其二进制）

开源桌面工具 [farion1231/cc-switch](https://github.com/farion1231/cc-switch)（Tauri + SQLite）：

| 概念               | 含义                             | Nomi 对齐方式                                                                                        |
| ------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 按工具的供应商档案 | Claude / Codex 等各自一组 preset | Nomi 内「CLI 供应商」档案，与 Nomi 原生 ProviderStore **分栏**，可一键「从 Nomi 供应商导入」         |
| 一键启用           | 只改 key 字段，备份后写回        | 原子写 + `userData/cli-providers/backups/`                                                           |
| Direct             | CLI 直连上游                     | 默认路径                                                                                             |
| Routing            | 本机代理做协议转换 / 故障转移    | **P1**：可选用现有 netGuard 纪律实现精简本地路由，或文档指引用户并用 cc-switch；不在 P0 重做完整路由 |
| Aggregation        | 多上游模型列表合并               | **P2**                                                                                               |
| Apps 页升级        | 检测版本、安装、升级             | 对标「版本与更新」章节，由看板娘执行                                                                 |

**不绑定 cc-switch 进程**：Nomi 实现同等「写配置」能力；若检测到用户已安装 cc-switch，只提示避免双写冲突（见开放问题）。

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

### 4.3 CLI 供应商切换（cc-switch 精简版）

设置或扩展面板新页 **「编程 CLI 供应商」**：

- 分栏：Claude Code | Codex（P2：Gemini…）。
- 档案列表：名称、base URL、model、协议、启用态；Key 走 **同一套 safeStorage**，不入明文 JSON。
- 预设：Anthropic 官方、OpenAI 官方、OpenRouter、DeepSeek、硅基流动、自定义……（可从 Nomi 已有 presets 映射）。
- **启用**：备份 → 写 `~/.claude/settings.json` env 或 `~/.codex/config.toml` + auth 字段 → Claude 热生效；Codex 提示重启。
- **从 Nomi 导入**：把原生供应商的 baseURL/model/key 复制为 CLI 档案（用户确认）。

P0 **不做** 完整 Routing / Aggregation；文档说明高级场景可继续用 cc-switch，并与双写冲突策略（开放问题）一致。

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

| 数据                                      | 位置                                              |
| ----------------------------------------- | ------------------------------------------------- |
| 后端偏好、每会话 backend/cwd/cliSessionId | `userData/harness/sessions.json` + 对话元数据字段 |
| CLI 供应商档案（无明文 key）              | `userData/cli-providers/store.json` + safeStorage |
| 配置备份                                  | `userData/cli-providers/backups/`                 |
| 更新缓存（latest 查询）                   | `userData/cli-update/cache.json`                  |

迁移：无破坏性变更；首次打开 CLI 后端时引导「选择工作目录 + 检测 CLI 是否安装」。不自动修改用户全局 git / npm 配置。

## 7. 测试计划

| 层级               | 内容                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| 单元               | stream-json / codex NDJSON 夹具解析；settings.json / config.toml 补丁只改 key 字段；版本比较 semver   |
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
5. **CLI 供应商 Direct 切换**（Claude settings.json env + Codex config 关键字段）+ 备份。
6. 设计文档定稿进 `docs/features/`（本文）；`agent-monitor.md` / `chat.md` 增加入口链接。

### P1 —— 接管与本地闭环（约 2–3 周）

1. 从监视器 **Resume 已有会话**。
2. Codex `--oss --local-provider ollama` 一键联调；文档化 Ollama 要求。
3. 流式 token / 工具时间线打磨；失败重试与「在终端打开」。
4. 可选：**精简本地 Routing**（Anthropic ↔ OpenAI 转换）或官方「与 cc-switch 共存」指南。
5. Windows 路径 / 无登录体验。

### P2 —— 扩展（择优）

- Cursor `agent` 接管；Gemini CLI。
- Aggregation；用量展示；多会话并行。
- Claude Agent SDK 替换裸 spawn（若 CLI 协议不稳定）。

## 9. 明确不做（本阶段）

- 在 Nomi 内复刻 Claude Code / Codex 的完整 agent 运行时。
- 静默调用 `sudo` / 无人值守改系统目录。
- 把用户 CLI 的 OAuth 登录态上传或同步到云端。
- P0 实现完整 cc-switch Routing/Aggregation。
- 未批准前的任何功能实现提交。

## 10. 开放问题（需产品拍板）

1. **与已安装的 cc-switch 双写**：检测到 `~/.cc-switch` 时 —— (A) 警告并继续；(B) 只读引导去 cc-switch；(C) 提供「导出到 cc-switch」？ **建议 P0=A，设置里可强关 Nomi 写入。**
2. **订阅登录 vs API Key**：Claude `/login`、Codex ChatGPT 登录是否要在 Nomi 内嵌浏览器完成，还是提示用户去终端？ **建议 P0 仅 API Key / 已有登录态；OAuth 指引外置。**
3. **接管时 Nomi 自有工具**：一律禁用，还是白名单并存（如仍允许「记一笔记忆」）？ **建议 P0 一律禁用，避免双通道。**
4. **默认后端**：保持 Nomi，还是检测到 CLI 就推荐切换？ **建议保持 Nomi。**
5. **更新范围**：是否包含 Gemini CLI / Aider 等监视列表全员？ **建议 P0 仅 Claude Code + Codex（+ Cursor 只检测不更新）。**
6. **工作目录模型**：全局一个 cwd，还是每个对话绑定？ **建议每对话绑定，切换后端时必选。**

## 11. 批准后的首个实现切片（仍等批准）

1. `CliUpdateService` + 面板只读版本行（无更新按钮也可先合入）。
2. Mock `claude`/`codex` + harness IPC + 后端下拉空壳。
3. 单测覆盖解析与配置补丁。

---

_调研来源：本仓库 `packages/electron/src/agents/*`、官方 Claude Code headless/CLI 文档、OpenAI Codex CLI reference、Cursor headless CLI 文档、cc-switch README（2026-10）。_
