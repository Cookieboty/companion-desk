# Live2D Widget React组件

这个包提供了一个React组件，用于在React应用中集成Live2D看板娘功能。

## 使用方法

1. 在你的React应用中引入Live2dWidget组件：

```tsx
import Live2dWidget from './components/Live2dWidget';
import type { Config } from './model';

const App: React.FC = () => {
  // Live2D Widget配置
  const live2dConfig: Config = {
    waifuPath: './assets/waifu-tips.json',
    cdnPath: 'https://fastly.jsdelivr.net/gh/fghrsh/live2d_api/',
    cubism2Path: './assets/live2d.min.js',
    tools: ['hitokoto', 'asteroids', 'switch-model', 'switch-texture', 'photo', 'info', 'quit'],
    logLevel: 'warn',
    drag: true,
  };

  return (
    <div className="app">
      <Live2dWidget config={live2dConfig} />
    </div>
  );
};
```

2. 确保你的项目中有以下资源文件：
   - `assets/waifu-tips.json`：看板娘配置文件
   - `assets/live2d.min.js`：Live2D核心库

## 配置选项

Live2dWidget组件接受一个`config`属性，它包含以下选项：

- `waifuPath`：看板娘配置文件的路径
- `cdnPath`：CDN路径，用于加载模型
- `cubism2Path`：Cubism 2核心库的路径
- `cubism5Path`：Cubism 5核心库的路径（可选）
- `modelId`：默认模型ID（可选）
- `tools`：要显示的工具列表（可选）
- `drag`：是否支持拖动看板娘（可选）
- `logLevel`：日志级别（可选）

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
``` 