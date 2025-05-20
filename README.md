# IG-Live 桌面看板娘应用

基于Electron和React的桌面看板娘应用。

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

这将同时启动React开发服务器和Electron应用。

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

## 功能

- 透明窗口
- 窗口拖动
- 窗口置顶
- 跨平台支持(Windows/macOS)

## 功能特点

- 透明无边框窗口
- 窗口拖拽
- 窗口置顶切换
- 加载和显示 Live2D 模型
- 模型互动和消息气泡

## 开发环境设置

### 前提条件

- Node.js (推荐 v16+)
- npm 或 yarn

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/live2d-electron.git
cd live2d-electron

# 安装依赖
npm install
# 或
yarn install
```

### 开发

```bash
# 启动开发服务器
npm start
# 或
yarn start
```

### 构建

```bash
# 构建应用
npm run build
# 或
yarn build

# 打包为可执行文件
npm run package
# 或
yarn package
```

## 项目结构

```
live2d-electron/
├── public/              # 静态资源
├── src/                 # 源代码
│   ├── components/      # React 组件
│   │   └── Live2DModel.tsx # Live2D 模型组件
│   ├── App.tsx          # 主应用组件
│   ├── index.tsx        # React 入口
│   ├── main.ts          # Electron 主进程
│   └── preload.ts       # Electron 预加载脚本
├── electron-tsconfig.json # Electron TypeScript 配置
└── package.json         # 项目配置
```

## 鸣谢

本项目基于 [stevenjoezhang/live2d-widget](https://github.com/stevenjoezhang/live2d-widget) 项目，使用了其中的 Live2D 模型加载和显示功能。感谢原作者的贡献！ 