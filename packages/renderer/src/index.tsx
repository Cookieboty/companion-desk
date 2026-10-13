import { initTheme } from '@ig-live/ui';
import React from 'react';
import ReactDOM from 'react-dom/client';

import '@ig-live/ui/styles.css';
import '@ig-live/voice/styles.css';

import { WaifuAIRoot } from './ai';
import App from './App';

// 主题（默认 Cool Mist；设置 → 通用 → 主题）
initTheme();

// 创建根元素
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

// 渲染应用
root.render(
  <WaifuAIRoot>
    <App />
  </WaifuAIRoot>,
);
