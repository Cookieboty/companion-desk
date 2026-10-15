# PR #8 验收清单：编程助手外壳（Claude Code / Codex / dsh）

> 逐项打勾即可。没装真实 CLI 时，可用 `NOMI_USE_MOCK_CLI=1`（可选 `NOMI_MOCK_DELAY_MS=8000` 放慢回复）启动，用内置的模拟 CLI 走通界面流程。
> 设计与细节见 [`docs/features/coding-agent-harness.md`](../features/coding-agent-harness.md)。

## 1. 版本检查与更新

- [ ] 日程面板（Mod+Shift+D）→ 编程助手 → 版本与更新：Claude Code / Codex / dsh 各一行，显示已装版本或「未安装」、npm 最新版本；「检查更新」可手动刷新。
- [ ] 有新版本时显示「有更新」和「更新」按钮；点击后先弹窗显示将执行的命令，确认后执行，完成后版本号刷新。
- [ ] 更新只走白名单命令（`claude update` / `codex update` / `npm install -g …@latest`），失败时显示错误原因。
- [ ] 未安装的 CLI 显示「未安装」，界面不报错。

## 2. 后端切换

- [ ] 输入框左下角的后端菜单可在 Nomi / Claude Code / Codex / dsh 之间切换；未安装的项不可选。
- [ ] 切到 CLI 后发送消息：回复流式出现，工具调用显示名称与结果，多轮对话能续上同一会话。
- [ ] 可以选择工作目录（cwd）；切换后端或 cwd 后开始新会话。
- [ ] 切回 Nomi 后原有对话、模型与工具照常可用。

## 3. 四套供应商档案、上游格式与本地路由

- [ ] 四套档案互相独立：Nomi 原生、Claude Code、Codex、dsh。改其中一套不影响其它三套。
- [ ] 启用档案只改连接字段（地址 / Key / 模型 / 协议）；自己写的 hooks、MCP、权限与注释保留；改写前有备份（`userData/cli-providers/backups/`）。
- [ ] Claude Code：Anthropic Messages 直连；OpenAI Chat Completions / Responses / Gemini 需要先开启本地路由。
- [ ] Codex：OpenAI Responses 直连；Chat Completions / Anthropic Messages 需要先开启本地路由。
- [ ] dsh：原生支持 openai-completions / openai-responses / anthropic-messages，不需要路由；写入 `~/.dsh/cordis.patch.yml` 中的托管块，Key 只在启动时注入。
- [ ] 本地路由（`127.0.0.1:18721`）：未开启时非原生格式档案不能启用；开启后流式文本、工具调用与工具结果都能往返。
- [ ] 接本机 Ollama：按文档设置 `OLLAMA_CONTEXT_LENGTH=20480` 后 Claude Code 回复正常（不设置会出现空回复）。

## 4. dsh

- [ ] dsh 作为后端能对话、续接会话，工具结果显示对应的工具名。
- [ ] PATH 上的 Node 低于 24 时，CLI 工具行显示「需要 Node ≥ 24」警告；此时运行 dsh 会给出明确错误，而不是一直没反应。

## 5. 多标签并发

- [ ] 标签栏「+」可新建 Claude Code / Codex / dsh 标签；Mod+T 打开同一菜单。
- [ ] 三个标签同时发送：默认最多 3 个同时运行，超出的显示「排队」（黄点），标签栏右侧显示「运行 x/3 · 排队 n」。
- [ ] 状态点：灰 = 空闲 · 蓝（脉动）= 运行中 · 黄 = 排队 · 红 = 出错 · 绿 = 有未读。
- [ ] 后台标签完成后出现未读角标，切过去后清零。
- [ ] 双击（或 Mod+Shift+R）重命名；关闭运行中的标签会先确认；中键也能关闭。
- [ ] 快捷键：Mod+Shift+W 关闭、Ctrl+Tab / Ctrl+Shift+Tab 切换、Mod+1…9 跳转；设置 → 快捷键可改绑。
- [ ] 输入框提示随标签变化（如「发给 Codex…」「Codex 正在处理…」「dsh 排队中…」），不再出现「请先选择AI模型…」。
- [ ] 重启应用：标签、标题、后端、cwd、会话与消息都恢复；中断的运行回到空闲。

## 6. 监视器与灵动岛

- [ ] 日程面板 → 编程助手 → 监视列表汇总所有端点：Claude Code、Codex、dsh（运行中以锁是否被持有判断）、Nomi 标签。
- [ ] 顶部按端点筛选，计数正确；标签条目点「打开标签」直达对应标签。
- [ ] 由标签驱动的 CLI 会话不会重复出现。
- [ ] 后台端点完成：看板娘说一句并挥手；失败时做思考动作。
- [ ] 灵动岛显示端点徽标与状态（完成 / 失败 / 需要处理 / 运行中），不同端点颜色不同。

## 7. 已知限制

- Nomi 后端只能在主标签使用：Nomi 的对话、模型与工具状态只有一份，多开会互相覆盖；新建标签只能选 CLI。
- CLI 标签不支持发送图片。
- dsh 需要 Node ≥ 24。
- 「运行中」的 dsh 精确判断仅限 Linux（读 `/proc/locks`）；macOS / Windows 退回进程扫描 + 修改时间，可能有延迟。
- 监视列表里外部启动的 CLI 会话只能查看，不能在标签中续接。
- 多上游模型列表合并（Aggregation）不在本 PR 范围内。
- 跨端分叉只复制可见文本作上下文，**不能**跨 CLI resume 原会话。
- 普通模式下后台 CLI 标签不可见但继续运行；切回开发可恢复。

## 8. 普通 / 开发模式与端点隔离

- [ ] 默认「普通」：看不到标签栏、后端切换器；Mod+T 无效果。
- [ ] 切到「开发」：标签栏与后端切换器出现；再切回普通时，若有 CLI 在跑，模式控件显示「N 运行中」，标签继续后台运行。
- [ ] 旧对话（无 backend）打开后归属 Nomi；侧栏徽标为 Nomi。
- [ ] 侧栏「全部」列出所有端点会话并带色标；「按端」可筛选 Nomi / Claude Code / Codex / dsh，未安装的 CLI 芯片禁用。
- [ ] 点击 Nomi 会话 → 主标签 + Nomi 历史；点击 Claude/Codex/dsh 会话 → 开发模式 + 对应 CLI 标签。
- [ ] 普通模式「新对话」只建 Nomi；开发 + 按端筛选时「新对话」建该端（CLI 则新建标签）。
- [ ] 有消息时切换后端：当前会话保留，目标端新建空会话 / 标签（不改写历史）。
- [ ] 分叉为新对话：同端出现「… (副本)」，源会话仍在。
- [ ] 分叉到其他端：目标端新建会话 / 标签并带上可见文本上下文；toast 确认；源会话未删。
- [ ] Mod+Shift+F 可触发同端分叉。
