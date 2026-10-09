# Companion Desk

> A local-first desktop AI assistant, with an optional Live2D desktop companion.

Companion Desk 是一个在本机运行的桌面 AI 助手：基于 Electron + React，AI 能力由
[`@ig-live/ai-runtime`](packages/ai-runtime) 的 **IgPluginHost + Vercel AI SDK** 提供（可选的
[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 仅保留给 doctor / 实验），
可以对接 DeepSeek / OpenAI 等云端模型，也可以完全离线地使用本地 Ollama / llama.cpp。
Live2D 桌面伙伴（看板娘）是**可选**的形象层：保留模型展示、换装、语音与口型同步，但不再是产品核心。

## 🚀 项目特点

- 🤖 **本地 AI 助手** - 独立的 AI 对话窗口，流式输出，支持多 provider（DeepSeek / OpenAI / Ollama / llama.cpp / Qwen / 豆包）
- 🔒 **本地优先** - 可只连本机 Ollama，对话与用户画像保存在本机 userData
- 🧠 **用户画像记忆** - 偏好抽取与持久化（`ai:userProfile:*`），工具调用（时间、随机数等内置工具）与护栏
- 🧩 **可扩展宿主** - IgPluginHost profile（`waifu` / `chat-only` / `mcp-headless`）+ ig 插件包 + Vercel AI SDK providers，MCP 桥接
- 🎭 **可选 Live2D 桌面伙伴** - Live2D Cubism 模型展示、动画互动、换装、TTS 口型同步
- 🔊 **语音反馈** - 编程关键词语音反馈、智能时间播报（可关闭）
- 🪟 **桌面体验** - 透明无边框窗口、置顶、拖拽、全局快捷键
- 📦 **工程化管理** - pnpm workspace + Turborepo，Vitest / Jest / Playwright 全链路测试

## ⚙️ 配置 AI 模型

主进程启动时从环境变量读取 LLM provider（未配置 key 的云端 provider 仍会注册，调用时给出明确报错）：

| 变量                                                        | 说明                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | DeepSeek（默认 `https://api.deepseek.com/v1`，模型 `deepseek-chat`）                    |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`       | OpenAI 或任意 OpenAI 兼容服务（默认模型 `gpt-4o-mini`）                                 |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL`                          | 本地 Ollama（默认 `http://127.0.0.1:11434/v1`，模型 `qwen2.5:3b-instruct`，无需 key）   |
| `IG_AI_PROFILE`                                             | AI profile，默认 `waifu`                                                                |
| `IG_DSH_CORE`                                               | `off`（默认，生产不用 dsh）/ `auto` / `required`（需安装 optional `@deepseek-ai/dsh*`） |
| `DSH_HOME`                                                  | 可选 dsh 状态目录，默认 `<userData>/dsh`（仅 `IG_DSH_CORE≠off` 时有意义）               |

例如完全本地运行：`ollama pull qwen2.5:3b-instruct && pnpm dev`；使用 DeepSeek：`DEEPSEEK_API_KEY=sk-... pnpm dev`。
AI 对话窗口默认选择 `deepseek` provider，可在模型设置中切换。

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
│   │   │   └── live2d/    # Live2D相关代码
│   │   └── package.json
│   └── types/             # 共享类型定义
│       └── index.ts       # IPC API类型定义
├── scripts/               # 构建和工具脚本
├── tasks/                 # 开发任务记录
├── assets/                # 静态资源
│   └── voice/             # 语音文件和配置
├── design/                # 设计资源
├── pnpm-workspace.yaml    # 工作区配置
├── turbo.json            # Turborepo配置
└── package.json          # 根配置文件
```

## 🛠️ 开发环境设置

### 系统要求

- Node.js >= 20（构建/测试）；运行时使用 Electron 44 自带的 Node 24（dsh 需要 Node >= 22）
- pnpm 9（见 `packageManager`）
- macOS/Windows/Linux

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

这将同时启动：

- React开发服务器 (Vite)
- Electron应用
- TypeScript编译监听
- 模型列表自动生成

开发模式下支持热重载，修改代码后应用会自动更新。

### 构建项目

```bash
# 构建所有包
pnpm build

# 单独构建渲染器
pnpm build:renderer

# 单独构建Electron
pnpm build:electron
```

### 打包应用

```bash
# 生产环境打包
pnpm package:prod

# macOS打包
pnpm package:prod:mac

# Windows打包
pnpm package:prod:win

# 调试模式打包
pnpm package:debug
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

### Live2D模型系统

- **模型加载** - 支持本地和远程模型加载
- **动画播放** - 支持待机、触摸等各种动画
- **换装系统** - 支持模型服装和配饰切换
- **物理效果** - 支持Live2D物理引擎
- **表情控制** - 支持表情参数调节
- **模型互动** - 支持鼠标点击和触摸互动

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

### 语音文件结构

```
assets/voice/
├── contributes.json       # 语音配置文件
├── function/             # 函数相关语音
├── condition/            # 条件语句语音
├── loop/                 # 循环语句语音
├── async/                # 异步操作语音
├── greeting/             # 问候语音
└── time/                 # 时间播报语音
```

### 语音配置示例

`contributes.json` 配置文件定义了关键词和对应的语音文件：

```json
{
  "contributes": [
    {
      "keywords": ["function", "def", "func"],
      "voices": ["function/voice1.mp3", "function/voice2.mp3"]
    },
    {
      "keywords": ["if", "else", "elif"],
      "voices": ["condition/voice1.mp3", "condition/voice2.mp3"]
    },
    {
      "keywords": ["$time_morning"],
      "voices": ["greeting/morning1.mp3", "greeting/morning2.mp3"]
    }
  ]
}
```

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
- Live2D模型增加视觉吸引力

## 🔧 配置说明

### 环境变量

- `NODE_ENV` - 运行环境 (development/production)
- `DEBUG` - 调试模式开关

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
3. 更新语音配置文件（如需要）
4. 更新文档

### 添加新的语音关键词

1. 在 `assets/voice/contributes.json` 中添加关键词配置
2. 准备对应的语音文件
3. 重启应用以加载新配置

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
  const rms = useTTSLipSync(); // 0..1，可直接喂给 Live2D setMouthOpenY
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

**升级说明与旧 API 弃用时间线**：[docs/plans/CHANGELOG.md](docs/plans/CHANGELOG.md)。

## 🙏 致谢

本项目基于多个开源项目和技术构建，特别感谢：

### 核心技术与框架

- [Live2D Widget](https://github.com/stevenjoezhang/live2d-widget) - 提供了Web端Live2D模型展示的核心实现
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

- [stevenjoezhang (Mimi)](https://github.com/stevenjoezhang) - Live2D Widget的原作者，提供了优秀的Web端实现
- [fghrsh](https://www.fghrsh.net/post/123.html) - 提供了最初的Live2D实现思路和API服务
- [一言](https://hitokoto.cn) - 提供了句子API服务
- [Live2D Inc.](https://www.live2d.com/) - 开发了Live2D技术和Cubism SDK

感谢所有开源社区的贡献者，他们的工作使本项目成为可能。本项目站在巨人的肩膀上，没有这些优秀的开源项目和社区支持，将无法实现。

## 📄 许可证

本仓库并不包含任何模型，用作展示的所有 Live2D 模型、图片、动作数据等版权均属于其原作者，仅供研究学习，不得用于商业用途。

本仓库的代码（不包括受 Live2D Proprietary Software License 和 Live2D Open Software License 约束的部分）基于 MIT 协议开源。

Live2D 相关代码的使用请遵守对应的许可：

**Live2D Cubism SDK 2.1 的许可证：**  
[Live2D SDK License Agreement (Public)](https://docs.google.com/document/d/10tz1WrycskzGGBOhrAfGiTSsgmyFy8D9yHx9r_PsN8I/)

**Live2D Cubism SDK 5 的许可证：**  
Live2D Cubism Core は Live2D Proprietary Software License で提供しています。  
https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_cn.html  
Live2D Cubism Components は Live2D Open Software License で提供しています。  
https://www.live2d.com/eula/live2d-open-software-license-agreement_cn.html

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
