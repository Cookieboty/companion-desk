<p align="center"><img src="docs/brand/nomi-wordmark.svg" alt="Nomi" width="320"></p>

<h1 align="center">Nomi·诺米</h1>

<p align="center">
  <b>你的桌面 AI 伙伴</b> —— 住在桌面，懂你所想，帮你做到。<br>
  Your desktop AI companion: lives on your desktop, gets what you mean, and gets it done.
</p>

<p align="center">Windows · macOS · Linux　|　中文 / English　|　MIT</p>

Nomi 是一个运行在你电脑上的 AI 助手：一位会动、会说话的桌面伙伴，加上一个干净好用的对话窗口。
它能连接你喜欢的云端大模型，也能完全离线使用本地模型；它记得你、会主动提醒你，还能帮你读文件、看屏幕、管日程。

## 📸 截图

<table>
  <tr>
    <td align="center" width="32%"><img src="docs/screenshots/mascot.png" alt="桌面上的 Nomi 与对话气泡"><br><sub>桌面伙伴</sub></td>
    <td align="center"><img src="docs/screenshots/chat.png" alt="对话窗口"><br><sub>对话窗口</sub></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><img src="docs/screenshots/command-palette.png" alt="命令面板" width="49%"> <img src="docs/screenshots/settings-providers.png" alt="供应商设置" width="49%"><br><sub>命令面板（Ctrl/⌘+K）· 供应商与模型</sub></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><img src="docs/screenshots/settings-en.png" alt="English UI" width="66%"><br><sub>English UI</sub></td>
  </tr>
</table>

## ✨ 功能

### 🧸 桌面伙伴 Nomi

- **会呼吸的角色**：分层立绘驱动的伪 3D 骨架——眨眼、视线跟随鼠标、呼吸、头发摆动、说话时口型同步
- **丰富表情**：开心、生气、难过、放松等表情随对话与任务状态自动切换；AI 也能让她做动作、换表情
- **好玩的互动**：摸头、单击、双击各有反应；拖着她甩一甩会手脚乱蹬，松手落到任务栏上弹一弹；可选沿屏幕底边散步，支持多显示器
- **透明不挡事**：只有角色本身可点击，其余区域鼠标直接穿透
- **对话气泡**：回复以气泡显示在她身边，自动避开脸部
- **换个形象**：可从模型商店下载开源 3D（VRM）角色，或导入你自己的 `.vrm` 模型，自定义名字、缩放、取景和表情映射
- **陪你写代码**：可选的编程关键词台词与整点问候
- **拖文件给她**：把文件拖到 Nomi 身上，直接帮你总结

### 💬 AI 对话

- **简洁的对话窗口**：类 Codex 的平静布局，流式输出，会话列表、侧栏可收起
- **图片与截图提问**：`Ctrl/⌘+Alt+A` 框选屏幕任意区域，直接带图提问
- **快捷命令**：输入框里按 `/` 打开命令，`↑` 找回上一条提问
- **首次引导**：几步完成语言、主题、角色与声音、称呼与语气、模型和隐私设置

### 🔑 供应商与 Token 管理

- **一键切换**：在对话窗口工具栏或系统托盘里直接切换供应商和模型，立即生效
- **内置预设**：OpenAI、Anthropic、Gemini、DeepSeek、Kimi、智谱 GLM、通义千问、豆包、MiniMax、xAI Grok、OpenRouter、硅基流动、Ollama、LM Studio 等，也可完全自定义
- **获取模型列表**：一键拉取供应商的可用模型，勾选启用、设为默认
- **测速**：发一个极小请求，显示真实延迟
- **多 Key 自动切换**：每个供应商可配置主 Key 与备用 Key，遇到失效或额度用尽时自动切到下一个
- **加密保存**：API Key 用系统钥匙串加密，只保存在本机，界面只显示掩码
- **按任务分配模型**：对话、工具调用、摘要可以分别指定不同的供应商与模型

### 📚 知识库

- 选几个文件夹或写几条笔记，Nomi 就能基于它们回答，并标出**可点击的引用来源**
- 支持 txt、Markdown、PDF、Word，以及图片里的文字（本地 OCR）
- 增量更新索引；可选接入本地或云端向量模型提升检索效果

### 🧠 长期记忆

- 对话结束后自动整理成记忆，下次聊到相关话题时自然想起
- 你的个人档案（称呼、偏好）随时可看、可改、可删、可导出

### ⏰ 主动日程与系统日历

- **提醒**：支持重复规则；错过的提醒在下次启动时补上
- **定时任务**：如「每日简报」，到点生成内容，用气泡 + 系统通知告诉你
- **主动聊天**（默认关闭）：按你设定的频率、活跃时段与免打扰时间偶尔搭话
- **日历**：连接 macOS / Windows / Linux 系统日历，或导入 .ics、订阅日历链接、连接 CalDAV

### 🖥️ 屏幕问答

- 框选屏幕直接提问
- 可选的**屏幕记忆**（默认关闭）：定时截屏并在本机识别文字，之后可以问「我刚才看的那个页面说了什么」；支持排除应用与自动清理

### 🧩 MCP 与技能

- 图形界面添加、连接、管理 MCP 服务器，查看工具列表；敏感工具调用前会请你确认
- 支持 `SKILL.md` 技能包：启用、编辑、新建，或从文件夹导入

### 🏠 本地模型

- 一键下载开源小模型并在本机运行，自动注册为可用的供应商
- 管理本机 Ollama 模型：列出、拉取、删除
- 完全离线也能聊天、做知识库问答

### 🤖 自动化

- **桌面文件**：授权文件夹后，AI 可以列出、搜索、阅读、总结文件；写入需确认，删除只进回收站并可撤销
- **笔记、提醒与剪贴板历史**（剪贴板默认关闭）
- **受控浏览器**：AI 可在独立、无痕的窗口中浏览公开网页，你能随时看到它在做什么
- **代码沙箱**：在隔离的临时目录里运行 JavaScript / Python 片段
- 所有操作都有本地审计日志

### 🎙️ 语音

- **语音输入**：本地离线识别，或使用你配置的在线识别服务；支持免按键对话
- **语音播报**：可用系统语音，也可**接入你自己的 TTS 服务**（支持参考音频克隆音色）
- 说话时自动打断播报，Nomi 的口型随声音同步

### 👀 编程助手监视

- 自动发现本机的 Claude Code、Codex、Cursor、Aider、Cline、Continue，任务完成或需要你操作时用气泡提醒你
- 只读取本机已有的日志与会话文件

### 🏝️ 灵动岛通知（macOS）

- 消息、编程助手进度和提醒以刘海处的「灵动岛」样式出现；其他平台以顶部胶囊显示

### 🎨 个性化

- **主题**：暖墨（默认）、石墨、纸白、冷雾，可跟随系统深浅色
- **应用图标**：多款图标可选，窗口、任务栏与托盘即时更新
- **快捷键**：`Ctrl/⌘+K` 命令面板、`Ctrl/⌘+N` 新对话、`Ctrl/⌘+L` 聚焦输入框、`Ctrl/⌘+,` 设置……全部可在设置中查看与改键，并提示冲突
- **中文 / English** 界面，可跟随系统
- **无障碍**：完整键盘操作、焦点管理，并尊重系统「减少动态效果」设置

### 🔄 自动更新

- 安装版会在后台检查并下载新版本，**经你确认后**才重启安装

### 🔒 隐私

- 对话、记忆、知识库、日程都保存在本机；可一键导出全部本地数据
- 可开启「仅本地模型」，敏感内容不发往云端

## 📦 下载安装

从 [GitHub Releases](https://github.com/Cookieboty/nomi-ai/releases) 下载对应平台的安装包：

| 平台                           | 安装包                                    |
| ------------------------------ | ----------------------------------------- |
| Windows 10+                    | `Nomi Setup x.y.z.exe`                    |
| macOS（Apple Silicon / Intel） | `Nomi-x.y.z-arm64.dmg` / `Nomi-x.y.z.dmg` |
| Linux（x64）                   | `Nomi-x.y.z.AppImage`                     |

## 🚀 快速开始

1. 安装并打开 Nomi，跟着首次引导选择语言、主题和角色。
2. 在「编程助手 → Nomi」里添加一个供应商（填入 API Key），或在「本机管理」里下载一个本地模型。
3. 点击 Nomi 或按 `Ctrl/⌘+N` 开始对话；按 `Ctrl/⌘+K` 浏览全部功能。

## 🛠️ 从源码构建

需要 Node.js ≥ 22.12 和 pnpm 9（`corepack enable`）。

```bash
git clone https://github.com/Cookieboty/nomi-ai.git && cd nomi-ai
corepack enable
pnpm install
pnpm dev                    # 开发模式运行

pnpm test                   # 测试
pnpm package                # 为当前平台打包，产物在 dist/
```

可用 `pnpm run doctor` 检查开发环境。打包与发布说明见 [docs/RELEASE.md](docs/RELEASE.md)。

## 📄 许可证

[MIT](LICENSE)。随应用分发的第三方组件与素材均为开源许可，清单见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 🙏 致谢

Nomi 构建在这些优秀的开源项目之上：

- [Electron](https://www.electronjs.org/)、[React](https://react.dev/)、[Vite](https://vitejs.dev/)、[Turborepo](https://turbo.build/)、[pnpm](https://pnpm.io/)
- [Vercel AI SDK](https://ai-sdk.dev/) 与 [Model Context Protocol](https://modelcontextprotocol.io/)
- [three.js](https://threejs.org/)、[@pixiv/three-vrm](https://github.com/pixiv/three-vrm)、[react-three-fiber](https://github.com/pmndrs/react-three-fiber) / [drei](https://github.com/pmndrs/drei)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)、[llama.cpp](https://github.com/ggml-org/llama.cpp)、[Silero VAD](https://github.com/snakers4/silero-vad)、[ONNX Runtime Web](https://onnxruntime.ai/)
- [Tesseract.js](https://tesseract.projectnaptha.com/) 与 [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)、[unpdf](https://github.com/unjs/unpdf)、[fflate](https://github.com/101arrowz/fflate)
- [Zustand](https://github.com/pmndrs/zustand)、[Immer](https://immerjs.github.io/immer/)、[Zod](https://zod.dev/)、[Lucide](https://lucide.dev/)、[react-window](https://github.com/bvaughn/react-window)
- [electron-builder](https://www.electron.build/) 与 electron-updater、[node-global-key-listener](https://github.com/LaunchMenu/node-global-key-listener)
- [Quaternius](https://quaternius.com/) Universal Animation Library（CC0）、[VRoid Project](https://vroid.com/) 样例角色（模型商店）、[Qwen](https://github.com/QwenLM) 开源模型（本地模型目录）

角色、动作与图标的作者和许可也可以在应用内「致谢」页查看。

## 🔗 链接

- [问题反馈](https://github.com/Cookieboty/nomi-ai/issues)
- [更新日志](CHANGELOG.md)
- [文档](docs/README.md)：功能说明、开发与测试
