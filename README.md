# AI 看板娘应用

这是一个基于 Electron、React 和 TypeScript 的 AI 看板娘应用，它是对 [stevenjoezhang/live2d-widget](https://github.com/stevenjoezhang/live2d-widget) 项目的重新实现。

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