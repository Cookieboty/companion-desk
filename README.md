# 智能编程助手桌面应用

基于Electron和React的桌面看板娘应用，专为程序员设计的智能语音助手，支持Live2D模型展示、编程关键词语音反馈和智能时间播报。

## 🚀 项目特点

- 🎭 **Live2D模型支持** - 完整的Live2D Cubism SDK集成，支持模型动画和互动
- 🪟 **透明无边框窗口** - 现代化的桌面应用界面设计
- 🎯 **窗口置顶功能** - 可切换的窗口置顶状态，编程时的贴心伴侣
- 🖱️ **拖拽移动** - 支持窗口拖拽移动，随心所欲调整位置
- ⌨️ **智能键盘监听** - 全局监听编程关键词，实时语音反馈
- 🔊 **编程语音助手** - 识别function、if、for、await等关键词并播放相应语音
- ⏰ **智能时间播报** - 根据时间段自动播放问候语音（早上、中午、晚上等）
- 🔄 **热重载开发** - 开发模式下支持代码热重载
- 💬 **消息气泡** - 模型互动和消息显示
- 🎨 **模型换装** - 支持模型服装和配饰切换
- 📦 **工程化管理** - 使用pnpm workspace + Turborepo

## 📁 项目结构

```
ig-live-monorepo/
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

- Node.js >= 16.0.0
- pnpm >= 8.0.0
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

## 🔗 相关链接

- [项目仓库](https://github.com/your-username/ig-live-monorepo)
- [问题反馈](https://github.com/your-username/ig-live-monorepo/issues)
- [开发文档](./docs/)
- [更新日志](./CHANGELOG.md)