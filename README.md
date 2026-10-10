# Companion Desk

> A local-first desktop AI assistant, with an optional 3D (VRM) desktop companion.

Companion Desk 是一个在本机运行的桌面 AI 助手：基于 Electron + React，AI 能力由
[`@ig-live/ai-runtime`](packages/ai-runtime) 的 **IgPluginHost + Vercel AI SDK** 提供（可选的
[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 仅保留给 doctor / 实验），
可以对接 DeepSeek / OpenAI 等云端模型，也可以完全离线地使用本地 Ollama / llama.cpp。
桌面伙伴（看板娘）是**可选**的形象层：开源 VRM 3D 角色、表情、语音与口型同步，但不是产品核心。

## 🚀 项目特点

- 🤖 **本地 AI 助手** - 独立的 AI 对话窗口，流式输出，支持多 provider（DeepSeek / OpenAI / Ollama / llama.cpp / Qwen / 豆包）
- 🔒 **本地优先** - 可只连本机 Ollama，对话与用户画像保存在本机 userData
- 🧠 **用户画像记忆** - 偏好抽取与持久化（`ai:userProfile:*`），工具调用（时间、随机数等内置工具）与护栏
- 🧩 **可扩展宿主** - IgPluginHost profile（`waifu` / `chat-only` / `mcp-headless`）+ ig 插件包 + Vercel AI SDK providers，MCP 桥接
- 🎭 **可选 3D 桌面伙伴** - 开源 VRM 角色（内置 1 个 + 模型商店 9 个模型，支持导入自己的 .vrm）、表情、眨眼/视线、TTS 口型同步
- 🔊 **语音反馈** - 编程关键词语音反馈、智能时间播报（可关闭）
- 🪟 **桌面体验** - 透明无边框窗口、置顶、拖拽、全局快捷键
- 📦 **工程化管理** - pnpm workspace + Turborepo，Vitest / Jest / Playwright 全链路测试

## ⚙️ 配置 AI 模型

主进程启动时从环境变量读取 LLM provider（未配置 key 的云端 provider 仍会注册，调用时给出明确报错）：

| 变量                                                        | 说明                                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | DeepSeek（默认 `https://api.deepseek.com/v1`，模型 `deepseek-chat`）                                                                                         |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`       | OpenAI 或任意 OpenAI 兼容服务（默认模型 `gpt-4o-mini`）                                                                                                      |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL`                          | 本地 Ollama（默认 `http://127.0.0.1:11434/v1`，模型 `qwen2.5:3b-instruct`，无需 key）                                                                        |
| `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`                      | Claude（`@ai-sdk/anthropic`）；另可选 `ANTHROPIC_BASE_URL`/`CLAUDE_BASE_URL`、`ANTHROPIC_MODEL`/`CLAUDE_MODEL`（默认 `claude-sonnet-4-5`）                   |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `GEMINI_API_KEY`           | Gemini（`@ai-sdk/google`）；另可选 `GOOGLE_GENERATIVE_AI_BASE_URL`/`GEMINI_BASE_URL`、`GOOGLE_GENERATIVE_AI_MODEL`/`GEMINI_MODEL`（默认 `gemini-2.5-flash`） |
| `IG_AI_PROFILE`                                             | AI profile，默认 `waifu`                                                                                                                                     |
| `IG_DSH_CORE`                                               | `off`（默认，生产不用 dsh）/ `auto` / `required`（需安装 optional `@deepseek-ai/dsh*`）                                                                      |
| `DSH_HOME`                                                  | 可选 dsh 状态目录，默认 `<userData>/dsh`（仅 `IG_DSH_CORE≠off` 时有意义）                                                                                    |

例如完全本地运行：`ollama pull qwen2.5:3b-instruct && pnpm dev`；DeepSeek：`DEEPSEEK_API_KEY=sk-... pnpm dev`；Claude：`ANTHROPIC_API_KEY=sk-ant-... pnpm dev`；Gemini：`GOOGLE_GENERATIVE_AI_API_KEY=... pnpm dev`。

### 多 Provider 与 Token 管理（面板）

AI 对话窗口底部工具栏的 **Provider 下拉框** 可一键切换当前 provider，🔑 按钮打开「AI Provider 与 Token」面板；系统托盘菜单同样可切换 / 打开面板（`IG_DISABLE_TRAY=1` 关闭托盘）。

- **预设**：DeepSeek、OpenAI、Anthropic Claude、Google Gemini、Ollama、OpenRouter、SiliconFlow、通义千问 DashScope、Moonshot Kimi、智谱 GLM、豆包火山方舟，以及「自定义（OpenAI 兼容）」。流程：选预设 → 粘贴 key → 测试连接 → 保存 / 保存并设为当前。每个 provider 可改 Base URL、默认模型、额外 Headers、启用开关。
- **Token 服务**：每个 provider 可有多个 key（主 + 备用）；主 key 遇到 401/403/429/额度类错误时自动切换到下一个；支持添加 / 轮换 / 设为主 / 删除 / 单独测试；界面只显示掩码（如 `sk-…abcd`）。
- **用量**：按 provider 在本地累计 AI SDK 返回的 token 用量（请求数 / 输入 / 输出 / 失败次数），不上报。
- **模型路由**：`chat`（对话）、`agent-tools`（带工具的 agent 循环）、`summary`（摘要类后台任务）可分别绑定 provider 与模型。
- 切换即时生效，无需重启。

**选择优先级**（请求未显式指定 provider 时）：

1. `COMPANION_PROVIDER=<provider id>` 环境变量（强制覆盖，面板切换不生效）
2. 面板中该任务的路由绑定（chat / agent-tools / summary）
3. 面板中的「当前 provider」（可以是面板添加的，也可以是环境变量 provider）
4. 环境变量 providers（已配 key 的云端 → Ollama → 未配 key 的）

面板保存的 provider 与环境变量 provider 互不覆盖：环境变量仍作为回退来源，面板里以「环境变量」标签只读展示（不显示 key）。

### 隐私说明

> **此 Token 仅保存在本地设备，不会上传或同步。**

- 面板配置保存在 `<userData>/ai-providers.json`（文件权限 0600）。API key 使用 Electron `safeStorage`（macOS 钥匙串 / Windows DPAPI / Linux libsecret·kwallet）加密后存储；若系统安全存储不可用（例如 Linux 无 keyring 或 `basic_text` 后端），会回退为仅编码保存，面板会显示明确警告。
- key 只在保存 / 测试时由界面单向发送到主进程；主进程之后只向界面返回掩码，不回传明文，不写日志，不同步到任何服务；对话请求只会发往你配置的 Base URL。

### MCP 工具（`@ai-sdk/mcp`）

生产路径通过 **AiSdkMcpPlugin + McpBridgePlugin** 接入 MCP：连接后把远端工具登记进与
`ToolsBuiltin` 相同的 `ToolRegistry`，再由 `ChatFacade.agent` / `agentStream` →
`AiSdkLlmProvider.withTools` → AI SDK `generateText` / `streamText`（`stopWhen: stepCountIs`）使用。

| 变量               | 说明                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_SERVERS`      | JSON 数组。元素：`{ id, name, transport, url?, command?, args?, env?, headers? }`。`transport` 为 `http`（推荐）/ `sse` / `stdio` / `websocket`（仅当 `url` 为 http(s) 时按 http 处理） |
| `MCP_AUTO_CONNECT` | `1` / `true` / `yes` 时启动即 `connect`（默认不自动连）                                                                                                                                 |

工具名默认加前缀 `` `${serverId}__${toolName}` ``，避免与内置工具或其它 MCP server 冲突。

示例（HTTP）：

```bash
MCP_SERVERS='[{"id":"demo","name":"Demo","transport":"http","url":"https://example.com/mcp","headers":{"Authorization":"Bearer …"}}]' \
MCP_AUTO_CONNECT=true pnpm dev
```

示例（本地 stdio，仅桌面/Node）：

```bash
MCP_SERVERS='[{"id":"fs","name":"Filesystem","transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]}]' \
MCP_AUTO_CONNECT=true pnpm dev
```

## 📁 项目结构

```
companion-desk/
├── packages/
│   ├── electron/           # Electron主进程和预加载脚本
│   │   ├── src/
│   │   │   ├── main.ts    # 主进程入口，全局键盘监听
│   │   │   └── preload.ts # 预加载脚本，IPC通信桥梁
│   │   └── package.json
│   ├── renderer/          # React前端渲染器
│   │   ├── src/
│   │   │   ├── App.tsx    # 应用主组件
│   │   │   ├── components/ # React组件
│   │   │   │   ├── ToolBar/ # 工具栏组件
│   │   │   │   └── VoiceSettings/ # 语音设置组件
│   │   │   ├── services/  # 业务服务
│   │   │   │   └── VoiceService.ts # 语音服务核心
│   │   │   ├── hooks/     # React Hooks
│   │   │   └── mascot/    # 看板娘后端抽象（MascotBackend）+ VRM 实现
│   │   └── package.json
│   └── types/             # 共享类型定义
│       └── index.ts       # IPC API类型定义
├── scripts/               # 构建和工具脚本
├── tasks/                 # 开发任务记录
├── design/                # 设计资源
├── pnpm-workspace.yaml    # 工作区配置
├── turbo.json            # Turborepo配置
└── package.json          # 根配置文件
```

## 🛠️ 开发环境设置

### 系统要求

- **Node.js >= 22.12**（推荐 22 LTS 或 24；仓库带 `.nvmrc`，`nvm install && nvm use` 即可）。版本过低时 `pnpm install` 会直接报错并提示如何升级。
- **pnpm 9**（`corepack enable` 后自动使用 `packageManager` 指定的版本）
- macOS（Apple Silicon / Intel）、Windows 10+、Linux（X11；无显示器时用 `xvfb-run`）

### 从零开始（一条命令启动）

```bash
git clone <repo> companion-desk && cd companion-desk
corepack enable          # 使用仓库锁定的 pnpm 版本
pnpm install
pnpm dev                 # 预检 → 构建 workspace 库 → 启动 Vite ×2 + Electron
```

`pnpm dev` 做了这些事：

1. `scripts/doctor.mjs --quick` 预检：Node/pnpm 版本、依赖是否安装、**Electron 二进制**（Electron 44 不再在
   postinstall 下载，首次运行时这里会下载）、端口 3000/5175 是否空闲。
2. turbo 先 `build` 所有 workspace 依赖（`@ig-live/ui`、`types`、`ai-sdk*`、`ai-runtime`、`bundle-ig-*`；有缓存时秒过）。
3. 并行启动：看板娘渲染进程 Vite（`:3000`）、对话窗口 Vite（`:5175`）、`packages/electron/scripts/dev.mjs`
   （先编译一次主进程与 preload，再 `tsc -w` + preload 监听，等两个端口就绪后以 `NODE_ENV=development` 启动 Electron）。

改渲染进程 / 对话窗口代码会热更新；改主进程代码后在终端 `Ctrl+C` 再 `pnpm dev` 重启。
改 workspace 库（如 `packages/ai-runtime`）时可另开终端跑 `pnpm dev:libs`（tsup --watch）。

带 provider 启动（也可以启动后在「AI 服务商」面板里配置）：

```bash
DEEPSEEK_API_KEY=sk-... pnpm dev
ANTHROPIC_API_KEY=sk-ant-... pnpm dev
GOOGLE_GENERATIVE_AI_API_KEY=... pnpm dev
ollama pull qwen2.5:3b-instruct && pnpm dev     # 完全本地，无需 key
```

环境变量见上文「配置 AI 模型」表格；全部可选。

### 环境自检

```bash
pnpm doctor        # 完整预检（含 provider key 提示）
pnpm doctor:dsh    # 仅当使用可选 dsh 内核（IG_DSH_CORE=auto|required）时
```

常见问题：

- `Node.util.isObject is not a function`：旧版本中按键监听的 key server 没有可执行位，回退到了与 Node 24 不兼容的
  sudo-prompt。已修复（启动前自动 `chmod +x`）；如仍遇到，`rm -rf node_modules && pnpm install`。
- macOS 上全局按键监听需要在「系统设置 → 隐私与安全性 → 辅助功能」里允许 Electron / Companion Desk；不授权只影响按键台词。
- 端口被占用：`lsof -i :3000` / `lsof -i :5175` 结束对应进程。
- Electron 下载慢：设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后 `pnpm doctor`。

### 构建

```bash
pnpm build             # 构建所有包（turbo，带缓存）
pnpm build:renderer    # 只构建看板娘渲染进程
pnpm build:electron    # 只构建主进程
```

### 打包

```bash
pnpm package:prod:mac      # macOS（dmg/zip，需在 macOS 上运行）
pnpm package:prod:win      # Windows（nsis，需在 Windows 上运行）
pnpm package:prod:linux    # Linux（AppImage x64）
pnpm package:prod          # 当前平台
pnpm package:debug         # 调试包（asar 关闭、DEBUG=true）
```

产物在仓库根目录 `dist/`。打包前会自动 `build`。签名/公证所需的证书环境变量
（`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID` 等）按 electron-builder 文档设置，未设置时生成未签名包。

### 测试

```bash
pnpm test              # 单元测试（所有包）
pnpm typecheck && pnpm lint
pnpm test:e2e:headed   # Playwright + Electron 端到端（先 pnpm build；Linux 下用 xvfb-run -a）
```

## ⌨️ 快捷键

- `Alt+P`: 切换窗口置顶状态
- `Alt+Q`: 退出应用

## 🎮 核心功能

### 智能语音助手

- **编程关键词识别** - 实时监听全局键盘输入，识别编程关键词
- **语音反馈** - 当检测到关键词时播放相应的语音提示
- **支持的关键词** - function、if、for、while、await、catch、import、export等
- **智能缓冲** - 1秒内的连续输入会被合并分析，避免重复播放

### 时间播报功能

- **智能时间段识别** - 自动识别早上、中午、下午、晚上、深夜时段
- **定时问候** - 在合适的时间播放问候语音
- **防重复播报** - 30分钟内不会重复播报相同内容
- **整点播报** - 每小时整点时播放特殊提示音

### 看板娘（VRM 3D）

- **开源渲染栈** - three.js + @pixiv/three-vrm（MIT），通过 `MascotBackend` 抽象接入，可扩展其他开源后端
- **内置角色** - 安装包只带默认角色（千駄ヶ谷 渋，CC0）；工具栏「切换角色」左键切到下一个，右键打开角色列表
- **模型商店** - 角色列表的「模型商店」页读取远程目录
  [Cookieboty/companion-desk-models](https://github.com/Cookieboty/companion-desk-models)（目前 10 个角色：7 个 CC0 VRoid 样例、lowteq 的 CC0 原创角色 Shapell（从 .blend 转换为 VRM 1.0）、AvatarSample_A/B（pixiv 条款：可商用、可再分发）），
  显示缩略图与许可徽章，下载带进度、断点续传、多镜像重试（GitHub Releases → jsDelivr → raw），**sha256 必须匹配**才会安装；
  可更新（版本号变化时提示）/ 删除；目录用 ETag 缓存，离线时显示缓存目录，已下载 / 内置模型照常可用。
  只接受开源许可（CC0 / CC-BY / CC-BY-SA / MIT / Apache-2.0 / OFL）或经审核、允许商用且允许再分发的条款（VRoid AvatarSample 条款、VRM Public License 1.0；条件显示在徽章与致谢页），与 `assets-licenses.json` 一致、仅 https、单文件 ≤ 200 MB，
  模型文件只做静态解析（GLB + VRM meta），不执行任何内容。文件保存在 `userData/models/remote/`，经 `cdmodel://` 协议只读提供给渲染进程。
  目录地址可用 `COMPANION_MODEL_CATALOG_URL`（逗号分隔多个）覆盖。添加模型见 [docs/MODELS.md](docs/MODELS.md)
- **桌面互动** - 透明区域点击穿透（逐像素；Linux 用窗口形状）、按身体区域的悬停 / 摸头 / 单击 / 双击反应（表情 + 动作 + 台词）、
  视线与头部跟随全局鼠标（颈部限位、阻尼平滑）；按住拖动窗口时手脚乱蹬、头发裙子随惯性摆动，松手下落到任务栏 / Dock 上方、反弹撞墙、落地压扁回弹；
  可选沿屏幕底边散步，支持多显示器。托盘 →「互动设置」可开关各项。细节与各平台限制见 [docs/MASCOT_INTERACTION.md](docs/MASCOT_INTERACTION.md)
- **桌面能力（文件）** - 在聊天窗口 📁 / 托盘「桌面能力」里通过系统选择框授权文件夹后，AI 可以列出 / 搜索 / 读取 / 总结 txt、md、pdf、docx
  （解析在限时限内存的子进程里进行）；把文件拖到看板娘身上即可总结（气泡 + 对话窗口）。写入需确认，删除只进应用回收站且必须在对话框确认，120 秒未答复自动拒绝；
  可撤销，所有操作写入本地审计日志；敏感目录（.ssh、钥匙串、浏览器配置等）始终拒绝；可开启「仅本地模型可读文件」。详见 [docs/DESKTOP_TOOLS.md](docs/DESKTOP_TOOLS.md)
- **导入自己的 VRM** - 「导入 VRM」页：文件对话框或拖放 `.vrm`（0.x / 1.0，≤ 300 MB）。会读取并展示 VRM meta
  （作者、许可、允许使用者、商用、再分发），并提示：**自行导入的模型由用户自己负责，只保存在本机 `userData/models/user/`，不会上传、同步或随应用分发**。
  导入后可设置名字、缩放、偏移、镜头取景、表情映射（如 `happy=Joy`）、允许的动作；配置可导出 / 导入为 JSON；可替换 VRM 文件或删除
- **统一模型注册表** - 内置 + 商店 + 导入的模型由主进程 `ModelRegistry` 统一提供，角色列表、托盘「切换角色」、
  AI 工具 `mascot_list_models` / `mascot_select_model` 都用同一份列表
- **口型同步** - TTS 音量包络驱动 VRM `aa`/`oh` 表情
- **表情** - 聊天 / Agent / 工具事件驱动 happy / angry / sad / relaxed，并有随机眨眼、视线跟随鼠标
- **身体动作** - 动画管理器（交叉淡入淡出、idle 循环 + 随机待机小动作、说话时切换说话姿态）。
  动作库 `public/assets/motions/motions.json` 由 `packages/renderer/scripts/build-motions.mjs` 生成：
  6 个片段重定向自 Quaternius _Universal Animation Library_（CC0：idle / talk / dance / jump / interact / flinch），
  9 个原创程序化手势（MIT：挥手 / 点头 / 摇头 / 思考 / 拍手 / 鞠躬 / 欢呼 / 伸懒腰 / 张望）。
  触发方式：聊天事件自动触发（6s 冷却）、工具栏「动作」（左键随机、右键列表）、托盘「看板娘动作」、
  AI 工具 `live2d_play_motion` / `live2d_set_expression`（名字沿用旧协议，经 IPC `mascot:command` 转发到渲染进程）
- **致谢 / Credits** - 工具栏「信息」或角色列表底部打开，列出每个角色 / 动作 / 图标的作者与许可（CC-BY 素材必须在此署名）
- **添加模型** - 新角色优先加到远程目录（见 [docs/MODELS.md](docs/MODELS.md)）；内置模型需放进 `packages/renderer/public/assets/models/vrm/` 并在 `model-list.json` 登记许可

### 窗口管理

- **透明无边框窗口** - 现代化的桌面应用界面
- **窗口拖拽** - 支持鼠标拖拽移动窗口位置
- **窗口置顶切换** - 可通过快捷键或界面切换置顶状态
- **位置记忆** - 自动保存和恢复窗口位置

### 开发功能

- **热重载** - 开发模式下代码修改实时生效
- **TypeScript支持** - 完整的类型安全
- **模块化架构** - 清晰的包结构和依赖管理
- **构建优化** - 使用Turborepo进行高效构建

## 🎨 语音配置

### 键盘关键词台词

「固定语音」模式下，输入代码关键词（`function` / `if` / `for` / `await` …）或到达特定时段时，
看板娘会在气泡里说一句台词，并用系统自带语音（Web Speech API）朗读。台词是项目原创文本，
定义在 [packages/renderer/src/mascot/tips.ts](packages/renderer/src/mascot/tips.ts)（`KEYWORD_LINES` / `TIME_GREETINGS`）。
旧版的第三方 mp3 语音包因许可不明已移除；「TTS」模式仍可接入你自己的 TTS 服务。

### 语音设置

应用提供了完整的语音设置界面：

- **总开关** - 启用/禁用语音功能
- **音量控制** - 调节语音播放音量
- **键盘监听** - 开启/关闭编程关键词监听
- **时间播报** - 开启/关闭智能时间播报
- **实时预览** - 设置界面提供功能说明和使用指南

## 🎯 使用场景

### 编程学习

- 帮助初学者熟悉编程关键词
- 通过语音反馈加深对语法的理解
- 提供编程时的陪伴感

### 日常编程

- 长时间编程时的语音陪伴
- 智能时间提醒，避免过度疲劳
- 可爱的桌面伴侣，缓解编程压力

### 直播编程

- 为观众提供有趣的互动元素
- 语音反馈让直播更加生动
- 3D 角色增加视觉吸引力

## 🔧 配置说明

### 环境变量

- `NODE_ENV` - 运行环境（`pnpm dev` 自动设为 `development`）
- `DEBUG` - 调试模式开关
- AI provider 相关变量见「配置 AI 模型」

### 构建配置

项目使用以下工具进行构建和打包：

- **Vite** - 前端构建工具，支持快速热重载
- **TypeScript** - 类型安全的JavaScript超集
- **Electron Builder** - Electron应用打包工具
- **Turborepo** - 高性能的monorepo构建系统
- **node-global-key-listener** - 全局键盘监听库

## 📝 开发指南

### 添加新功能

1. 在对应的包中添加代码
2. 更新类型定义 (`packages/types`)
3. 更新文档

### 添加新的语音关键词

1. 在 `packages/renderer/src/mascot/tips.ts` 的 `KEYWORD_LINES` 中添加关键词与台词
2. 重新构建 renderer

### 调试技巧

- 使用 `pnpm package:debug` 构建调试版本
- 开发模式下可以使用浏览器开发者工具
- 查看 `tasks/` 目录中的开发记录
- 语音服务会在控制台输出错误信息

### 代码规范

- 使用TypeScript进行类型安全开发
- 遵循React最佳实践
- 保持代码模块化和可维护性
- 重要的错误信息使用console.error输出

### 新建一个 workspace 包（模板法）

本仓库已内置一个"3 行 extends 即可起手"的包模板：[templates/pkg-template](templates/pkg-template)。

```bash
# 1. 复制模板到 packages/
cp -r templates/pkg-template packages/<your-pkg>

# 2. 改包名（macOS 用 sed -i ''，Linux 用 sed -i）
sed -i '' 's|@ig-live/pkg-template|@ig-live/<your-pkg>|g' \
  packages/<your-pkg>/package.json packages/<your-pkg>/src/*.ts

# 3. 安装并冒烟：build / test / lint / typecheck 应全绿
pnpm install
pnpm --filter @ig-live/<your-pkg> build test lint typecheck
```

模板复用的根级配置：

- 类型：[tsconfig.base.json](tsconfig.base.json) + [tsconfig.node.json](tsconfig.node.json) / [tsconfig.dom.json](tsconfig.dom.json)
- 打包：[tsup.base.ts](tsup.base.ts)（预设 `node-lib` / `react-lib` / `node-cli`）
- 测试：[vitest.base.ts](vitest.base.ts)
- Lint：[eslint.config.mjs](eslint.config.mjs)（ESLint 9 flat config，渲染进程禁引 `electron`）
- Turbo pipeline：[turbo.json](turbo.json)（`build` / `test` / `lint` / `typecheck` / `test:e2e`）

## 🤖 AI SDK 最小示例

自 P7/P8 起，所有 AI 能力（聊天 / 会话 / 工具 / TTS / ASR / 用户 Profile）统一走 [`@ig-live/ai-sdk-client`](packages/ai-sdk-client)（渲染进程）与 [`@ig-live/ai-sdk`](packages/ai-sdk)（主进程 / Node CLI）门面。三端接入 checklist：[docs/consumer-integration.md](docs/consumer-integration.md)。

**渲染进程（React）**：

```tsx
import { AIProvider, useChat, useTTSLipSync } from '@ig-live/ai-sdk-client';

function ChatBox() {
  const { messages, send, streaming } = useChat();
  const rms = useTTSLipSync(); // 0..1，可直接喂给看板娘口型（VRM `aa` 表情）
  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>
          {m.role}: {m.content}
        </p>
      ))}
      <button disabled={streaming} onClick={() => send('你好')}>
        send
      </button>
      <meter min={0} max={1} value={rms} />
    </div>
  );
}

export function App() {
  // Provider 会从 window.aiIPC 读取 bridge；`profile` 由主进程 `startAIRuntime({ profile })` 决定
  return (
    <AIProvider>
      <ChatBox />
    </AIProvider>
  );
}
```

**主进程（Electron）**：由 [Application.startAIRuntime](packages/electron/src/core/Application.ts#L121-L148) 自动装配；如需自定义可直接调用 [startAIRuntime](packages/electron/src/ai/AIRuntimeBoot.ts#L120-L217)：

```ts
import { startAIRuntime, TtsElectronNativeProvider } from '@ig-live/electron/ai';
import { AdvancedTTSEngine } from '@ig-live/electron/services/AdvancedTTSEngine';

const runtime = await startAIRuntime(logger, {
  profile: 'waifu',
  ttsProviders: [new TtsElectronNativeProvider({ engine: new AdvancedTTSEngine() })],
});

for await (const chunk of runtime.client.chat.stream({
  messages: [{ role: 'user', content: '你好' }],
})) {
  process.stdout.write(chunk.deltaText ?? '');
}
```

**preload**：使用 [`mkAiPreload`](packages/ai-sdk-client/src/preload/mkAiPreload.ts) 注入白名单 IPC 通道（`ai:*` 前缀）；详见 [docs/preload-usage.md](docs/preload-usage.md)。

**升级说明与旧 API 弃用时间线**：[docs/plans/CHANGELOG.md](docs/plans/CHANGELOG.md)、[docs/HISTORY.md](docs/HISTORY.md)。

## 🙏 致谢

本项目基于多个开源项目和技术构建，特别感谢：

### 核心技术与框架

- [three.js](https://threejs.org/) 与 [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) - 3D 渲染与 VRM 支持（MIT）
- [VRoid Project](https://vroid.com/) - 内置的 CC0 样例角色模型
- [Quaternius](https://quaternius.com/) - Universal Animation Library（CC0），重定向为看板娘身体动作
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用开发框架
- [React](https://reactjs.org/) - 用户界面库
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的JavaScript超集
- [Turborepo](https://turbo.build/) - 高性能构建系统
- [Vite](https://vitejs.dev/) - 现代化的前端构建工具

### 开发工具与依赖

- [node-global-key-listener](https://github.com/LaunchMenu/node-global-key-listener) - 全局键盘监听功能
- [electron-reload](https://github.com/yan-foto/electron-reload) - 提供Electron应用的热重载功能
- [concurrently](https://github.com/open-cli-tools/concurrently) - 同时运行多个命令的工具
- [pnpm](https://pnpm.io/) - 快速、节省磁盘空间的包管理器
- [cross-env](https://github.com/kentcdodds/cross-env) - 跨平台设置环境变量
- [wait-on](https://github.com/jeffbski/wait-on) - 等待资源可用的工具
- [electron-builder](https://www.electron.build/) - 打包和分发Electron应用

### 特别致谢

- [一言](https://hitokoto.cn) - 提供了句子API服务

感谢所有开源社区的贡献者，他们的工作使本项目成为可能。本项目站在巨人的肩膀上，没有这些优秀的开源项目和社区支持，将无法实现。

## 📄 许可证

本仓库代码基于 MIT 协议开源。随应用分发的所有第三方组件与资源（依赖、VRM 模型、图标、音效）
都使用开源许可，清单见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；资源许可登记在
[assets-licenses.json](assets-licenses.json)，CI 通过 `pnpm check:licenses` 强制校验。

> 历史：早期版本使用 Live2D Cubism 2 专有运行时与来源不明的 Live2D 模型，已因许可原因全部移除
> （见 [docs/plans/mascot-open-source.md](docs/plans/mascot-open-source.md)）。

---

## 🧠 可选 dsh 基座（doctor / 实验）

生产路径已迁到 **IgPluginHost + Vercel AI SDK**（`createAiSdkBooter`）。`@deepseek-ai/dsh*` 改为根 `optionalDependencies`，仅 doctor / `IG_DSH_CORE=required|auto` 时使用。若仍需锁定 dsh：

- **锁死主版本**：根 [package.json](package.json)`.optionalDependencies` 中所有 `@deepseek-ai/dsh*` 均写 **exact** 版本，当前锁定 `0.2.0-rc.2`。
- **三处同步**：升级 dsh 需同步更新 3 个地方 —— 根 [package.json](package.json)、`profiles/*/package.json`（`@deepseek-ai/dsh-base`）、`packages/bundle-ig-base/package.json.peerDependencies['@deepseek-ai/dsh']`。
- **profiles/ 承载配置**：三份 profile（`waifu` / `chat-only` / `mcp-headless`）以目录形式存放在 [profiles/](profiles)，每份 = `package.json` + `cordis.patch.yml`，详细结构与 override 顺序见 [profiles/README.md](profiles/README.md)。
- **升级 SOP**：完整 9 步升级流程记录在 [profiles/README.md](profiles/README.md#dsh-升级-sop)。
- **本地自检**：`pnpm run doctor <profile>` 装配诊断；`pnpm run test:root` 冒烟三份 profile 的 `loadProfile + composeEntries` 契约。

---

## 🔗 相关链接

- [项目仓库](https://github.com/Cookieboty/companion-desk)
- [问题反馈](https://github.com/Cookieboty/companion-desk/issues)
- [开发文档](./docs/)
- [更新日志](./CHANGELOG.md)
