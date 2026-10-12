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

## 行为

- 默认开启；可按工具开关。
- 首次发现「已完成/已失败」的历史会话不打扰；只在状态变化或卡住时气泡提醒。
- 卡住阈值：长时间无文件更新（默认 5 分钟）。
- 免打扰：与日程免打扰独立；本监视器默认不发系统通知（可开）。

## 实现

- 主进程：`packages/electron/src/agents/AgentProgressService.ts`
- 解析：`packages/electron/src/agents/parsers.ts`
- UI：日程面板「编程助手」
