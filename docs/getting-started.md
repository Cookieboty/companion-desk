# 快速上手

## 安装

从 [GitHub Releases](https://github.com/Cookieboty/nomi-ai/releases) 下载：

| 平台                           | 安装包                                    |
| ------------------------------ | ----------------------------------------- |
| Windows 10+                    | `Nomi Setup x.y.z.exe`                    |
| macOS（Apple Silicon / Intel） | `Nomi-x.y.z-arm64.dmg` / `Nomi-x.y.z.dmg` |
| Linux（x64）                   | `Nomi-x.y.z.AppImage`                     |

未签名的安装包在 Windows SmartScreen / macOS Gatekeeper 下可能会提示风险，确认来源后继续即可。

## 首次引导

第一次启动会打开对话窗口并进入 6 步引导：**界面语言 → 主题 → 角色与声音 → 称呼与语气 → 模型供应商 → 隐私**。
每一步都可以跳过，之后可在「设置 → 重新打开新手引导」再走一遍。

## 接入一个模型

二选一：

- **云端模型**：设置 →「供应商与模型」→「添加供应商」，选择预设（如 DeepSeek、OpenAI、Kimi），填入 API Key，点「获取模型」后勾选并设为默认。见 [供应商与 Token](features/providers.md)。
- **本地模型**：对话窗口 🏠（`Ctrl/⌘+Shift+J`）→ 下载一个推荐的小模型并启动，它会自动成为可用的供应商。见 [本地模型](features/local-models.md)。

## 常用快捷键

| 快捷键         | 作用                           |
| -------------- | ------------------------------ |
| `Ctrl/⌘+K`     | 命令面板（搜索全部操作与设置） |
| `Ctrl/⌘+N`     | 新对话                         |
| `Ctrl/⌘+L`     | 聚焦输入框                     |
| `Ctrl/⌘+,`     | 打开设置                       |
| `Ctrl/⌘+Alt+A` | 在任意界面截图提问             |
| `F2`（按住）   | 按住说话                       |

完整列表与改键见 [个性化](features/personalization.md)。

## 托盘菜单

系统托盘里可以：打开对话、切换 AI 供应商、打开供应商设置与桌面能力、让 Nomi 做动作、切换角色 / 打开模型商店、调整互动设置、退出。
