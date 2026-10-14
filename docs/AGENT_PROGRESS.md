# 编程助手进度监视（PC）

看板娘可以提醒你：本机开源编程助手的任务进行中 / 完成 / 失败 / 卡住。

**原则**：只读各工具已写入本机的日志与会话文件；从不登录、不刮取远端账号。

设置入口：日程面板 →「编程助手」标签（`Ctrl/⌘+Shift+D`，再 `Alt+4`）。

## 各工具能力（有文档证据）

| 工具                  | 可行性 | 本机信号                                                                                                                                                                                        | 证据                                                                                                                                                                                                                                          |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Codex CLI**         | ✅ 强  | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`；`codex exec --json` 事件：`thread.started` / `turn.started` / `turn.completed` / `turn.failed` / `error`；TUI 日志 `~/.codex/log/codex-tui.log` | [Developer commands](https://developers.openai.com/codex/cli/slash-commands.md)、[Non-interactive mode](https://www.codex-docs.com/en/docs/non-interactive-mode)、[agent-watch discussion](https://github.com/openai/codex/discussions/42041) |
| **Claude Code**       | ✅ 强  | `~/.claude/projects/<encoded-cwd>/<session>.jsonl`（progress / result）；`claude -p --output-format stream-json`；`claude agents --json`；statusline stdin JSON                                 | [Sessions](https://code.claude.com/docs/en/sessions)、[CLI reference](https://code.claude.com/docs/en/cli-reference)、[Status line](https://code.claude.com/docs/en/statusline)                                                               |
| **Aider**             | ⚠️ 中  | 项目根 `.aider.chat.history.md`；可选 `~/.aider/analytics.jsonl`（需 `--analytics-log`）                                                                                                        | [Aider analytics](https://github.com/Aider-AI/aider/blob/main/aider/analytics.py)、[deja aider format](https://vshulcz.github.io/deja-vu/registry/aider.md)                                                                                   |
| **Cline**             | ⚠️ 中  | CLI `cline --json` NDJSON；`~/.cline/data/...` job 元数据 / 日志（`CLINE_LOG_PATH`）                                                                                                            | [Cline CLI README](https://cdn.jsdelivr.net/gh/cline/cline@main/apps/cli/README.md)                                                                                                                                                           |
| **Continue**          | ⚠️ 中  | `~/.continue/sessions/<id>.json` + `sessions.json`                                                                                                                                              | [Continue paths](https://github.com/continuedev/continue/blob/main/core/util/paths.ts)                                                                                                                                                        |
| **Cursor agent 终端** | ⚠️ 弱  | 无稳定公开进度 IPC；仅启发式扫描 `~/.cursor` 下含 agent 的本地日志 mtime                                                                                                                        | 无官方进度 API；避免账号刮取                                                                                                                                                                                                                  |

## 会话判定（v1 重写）

旧实现把 24 小时内每个写过的 JSONL 都当成一个会话，最后一行是 `assistant`/`user` 就算「进行中」，
超过阈值就「可能卡住」——Claude Code 的交互会话从不写 `result` 行，于是一个真实会话 + 一堆历史文件
全变成「可能卡住」。现在：

1. **按会话 id 去重**：Claude 用 `sessionId`（子代理 `<id>/subagents/*.jsonl` 并入父会话）；Codex 用
   `session_meta.payload.id`（或文件名里的 UUID）；Gemini 用 `sessionId`；Cursor 用 chat 目录。
2. **进程存活**：每 8 秒异步列一次进程（macOS/Linux `ps`，Linux 读 `/proc/<pid>/cwd`，macOS `lsof -d cwd`；
   Windows `Get-CimInstance Win32_Process`）。识别 `claude` / `codex` / `cursor-agent`·Cursor / `aider` /
   `gemini` / `cline`（排除 Claude、Codex 桌面版）。每个进程只「认领」一个会话：先按 cwd 精确匹配该目录下
   最新的会话，拿不到 cwd 时认领同类最新的会话。
3. **状态**：`running`（最近有写入）· `waiting`（这一轮结束，进程还在，等你回复）· `stalled`（**进程活着 +
   上一步是工具调用 + 超过阈值无写入**）· `completed` / `failed` · `idle`（已结束）。
4. **可见性**：进程在跑的会话总显示；其它只在最后活动 30 分钟内显示。
5. **标题**：第一条用户提问（跳过 `/clear` 等命令包装与注入的环境块）→ 项目目录名 → cwd；显示最后活动时间。

格式依据（2026-10 复核）：

| 工具                     | 路径                                                     | 关键字段                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code              | `~/.claude/projects/<编码 cwd>/<sessionId>.jsonl`        | `type` user/assistant/system/summary，`message.stop_reason`（`tool_use` / `end_turn`），`isSidechain`                                                             |
| Codex CLI                | `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` | `session_meta`、`event_msg.payload.type`（task_started / task_complete / user_message / exec_command_begin …）、`response_item`（function_call）；兼容旧 `turn.*` |
| Gemini CLI               | `~/.gemini/tmp/<projectHash>/chats/session-*.json`       | `sessionId`、`messages[].type`（user / gemini）、`toolCalls`                                                                                                      |
| Cursor                   | `~/.cursor/chats/<hash>/<chatId>/store.db`               | 私有 SQLite，**只用 mtime + 进程**；IDE 的 `workspaceStorage/*/state.vscdb` 同样是私有格式，未解析                                                                |
| Aider / Cline / Continue | 见上表                                                   | 会话文件是全局的，只判断该类进程是否在跑                                                                                                                          |
| Windsurf                 | `~/.codeium/windsurf`                                    | 会话为加密 / 私有格式，未支持                                                                                                                                     |

## 行为

- 默认开启；可按工具开关。
- 首次发现「已完成/已失败」的历史会话不打扰；只在状态变化或卡住时气泡提醒。
- 卡住阈值：进程活着、上一步是工具调用、且长时间无文件更新（默认 5 分钟）。
- 免打扰：与日程免打扰独立；本监视器默认不发系统通知（可开）。

## 实现

- 主进程：`packages/electron/src/agents/AgentProgressService.ts`
- 解析：`packages/electron/src/agents/parsers.ts`
- UI：日程面板「编程助手」
