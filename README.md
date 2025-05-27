# 智能小助手桌面应用

基于Electron和React的桌面看板娘应用，支持实时热重载开发。

[English](README.en.md)

## 项目结构

使用pnpm workspace + Turborepo进行工程化管理:

```
ig-live-monorepo/
├── packages/
│   ├── electron/    - Electron主进程代码
│   ├── renderer/    - React前端渲染器
│   └── types/       - 共享类型定义
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 开发环境设置

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

这将同时启动React开发服务器和Electron应用。开发模式下支持热重载，修改代码后应用会自动更新。

### 构建项目

```bash
pnpm build
```

### 打包应用

```bash
pnpm package
```

## 快捷键

- `Alt+P`: 切换窗口置顶状态
- `Alt+Q`: 退出应用

## 功能特点

- 透明无边框窗口
- 窗口拖拽
- 窗口置顶切换
- 加载和显示 Live2D 模型
- 模型互动和消息气泡
- 开发模式下支持热重载

## 模型仓库

本项目并不包含任何模型，需要单独配置模型仓库来显示Live2D模型。

### 模型结构

模型仓库应该具有以下结构：

```
models/
├── model_list.json
├── [模型名称1]/
│   ├── index.json
│   ├── model.json
│   ├── model.moc
│   ├── textures/
│   │   ├── texture_00.png
│   │   └── ...
│   ├── physics.json
│   └── textures.cache
└── [模型名称2]/
    └── ...
```

`model_list.json`文件包含所有可用模型的信息，每个模型目录包含模型文件和纹理。

### 推荐的模型资源

出于研究和学习目的，您可以参考以下模型仓库：

- [live2d-model-assets](https://github.com/zenghongtu/live2d-model-assets)
- [live2d_api](https://github.com/fghrsh/live2d_api)

请确保您遵守所使用模型的许可条款。

## 致谢

本项目基于多个开源项目和技术构建，特别感谢：

### 核心技术与框架

- [Live2D Widget](https://github.com/stevenjoezhang/live2d-widget) - 提供了Web端Live2D模型展示的核心实现
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用开发框架
- [React](https://reactjs.org/) - 用户界面库
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的JavaScript超集
- [Turborepo](https://turbo.build/) - 高性能构建系统

### 开发工具与依赖

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

<a href="https://www.jsdelivr.com">
  <img alt="jsDelivr Logo" height="80" src="https://raw.githubusercontent.com/jsdelivr/jsdelivr-media/master/default/svg/jsdelivr-logo-horizontal.svg">
</a>

> 感谢jsDelivr提供的CDN服务。

## 许可证

本仓库并不包含任何模型，用作展示的所有 Live2D 模型、图片、动作数据等版权均属于其原作者，仅供研究学习，不得用于商业用途。

本仓库的代码（不包括受 Live2D Proprietary Software License 和 Live2D Open Software License 约束的部分）基于 GNU General Public License v3 协议开源  
http://www.gnu.org/licenses/gpl-3.0.html

Live2D 相关代码的使用请遵守对应的许可：

Live2D Cubism SDK 2.1 的许可证：  
[Live2D SDK License Agreement (Public)](https://docs.google.com/document/d/10tz1WrycskzGGBOhrAfGiTSsgmyFy8D9yHx9r_PsN8I/)

Live2D Cubism SDK 5 的许可证：  
Live2D Cubism Core は Live2D Proprietary Software License で提供しています。  
https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_cn.html  
Live2D Cubism Components は Live2D Open Software License で提供しています。  
https://www.live2d.com/eula/live2d-open-software-license-agreement_cn.html