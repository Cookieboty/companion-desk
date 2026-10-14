# 编程助手监视

Nomi 可以帮你盯着本机正在跑的编程助手：任务完成、失败、等你回复或疑似卡住时，用气泡提醒你。

入口：日程面板 →「编程助手」标签（`Ctrl/⌘+Shift+D`）。

## 支持的工具

Claude Code、Codex CLI、Gemini CLI、Cursor、Aider、Cline、Continue。可以按工具单独开关。

## 状态

- **进行中**：最近有活动。
- **等你回复**：这一轮已结束，进程还在。
- **可能卡住**：进程还在，上一步是工具调用，且长时间（默认 5 分钟）没有更新。
- **已完成 / 失败 / 已结束**。

首次发现的历史会话不会打扰你，只在状态变化或卡住时提醒。默认不发系统通知（可开启），macOS 上可以显示在 [灵动岛](dynamic-island.md)。

## 原则

只读取这些工具已经写在本机的会话与日志文件，并检查对应进程是否在运行；从不登录、不访问任何远端账号。

## 技术说明

- 实现：`packages/electron/src/agents/AgentProgressService.ts`（进程检测、会话去重）与 `parsers.ts`（各工具的会话格式）。
- Claude Code、Codex、Gemini CLI 会解析会话内容；Cursor 的会话是私有格式，只根据文件更新时间与进程判断。
