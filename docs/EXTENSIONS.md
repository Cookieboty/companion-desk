# 扩展：MCP 服务器与 SKILL.md 技能包

打开：🧩 按钮或 **Ctrl/⌘+Shift+E**（Alt+1/2 切换标签，Ctrl/⌘+N 新建，技能编辑器里 Ctrl/⌘+S 保存）。

## MCP 服务器（图形界面）

- 添加本地命令（stdio）或远程 HTTP / SSE 服务器；内置几个官方参考服务器预设（filesystem / memory /
  sequential-thinking，MIT，**不随应用分发**，首次连接由 `npx` 从 npm 获取）。
- 可粘贴通用的 `{ "mcpServers": { … } }` JSON 导入；导入后默认不连接。
- 配置存 `userData/extensions/mcp.json`；名称含 key/token/secret/password/auth 的环境变量与请求头用
  Electron `safeStorage` 加密，界面里打码显示。
- 连接后列出工具（标注只读 / 破坏性），并按每个服务器的信任级别包装：
  - 每次确认（默认）· 只读自动其它确认 · 全部自动；破坏性工具永远要在详情对话框确认。
  - 破坏性标记不完全相信远端自报的 `destructiveHint`：本地额外保守推断——stdio 服务器的非只读工具
    一律视为破坏性，远程工具按危险命名（exec/delete/write/shell 等）判定；`readOnlyHint` 明确为真才豁免。
  - 确认走看板娘的 PermissionBroker 气泡 / 对话框；每次调用写入审计日志（source = `mcp`）。
- 环境变量 `MCP_SERVERS` 里的服务器在界面中只读展示（不可编辑），但其工具与图形界面添加的服务器走
  **同一条确认 + 审计链**：含写入 / 执行类工具时每次调用都会请你确认。

## 技能包（SKILL.md）

- 一个文件夹 = 一个技能，位于 `userData/skills/<name>/SKILL.md`，开头是 frontmatter：
  ```
  ---
  name: travel-planner
  description: 用户要规划旅行行程时使用：…
  version: 1.0
  ---
  （给助手看的 Markdown 说明）
  ```
- 渐进加载：对话 system 里只放已启用技能的「名称 + 描述」；模型需要时调用 `skill_load` 读全文，
  `skill_read_file` 读同目录参考文件（只读、纯文本、≤64 KB、禁止越出技能目录）。技能不会执行脚本。
- 可新建 / 编辑 / 启停 / 删除，或从文件夹导入（不跟随符号链接，≤5 MB）。附带两个自写的示例技能
  （weekly-report、meeting-notes，MIT）。
- 自研实现，无新增依赖。
