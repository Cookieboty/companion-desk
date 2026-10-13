import { AIProvider } from '@ig-live/ai-sdk-client/react';
import { initTheme } from '@ig-live/ui';
import React from 'react';
import ReactDOM from 'react-dom/client';

import '@ig-live/ui/styles.css';
import '@ig-live/voice/styles.css';
import App from './App';
import { SnipOverlay } from './components/SnipOverlay';

// 主题（默认 Cool Mist；设置 → 通用 → 主题）
initTheme();

const hasAiIpc = typeof window !== 'undefined' && Boolean((window as { aiIPC?: unknown }).aiIPC);

if (!hasAiIpc) {
  console.warn('当前运行在开发模式：window.aiIPC 未就绪，将使用 Mock 数据');
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (window.location.hash === '#snip') {
  // 截图框选遮罩：不加载对话应用本身
  root.render(<SnipOverlay />);
} else if (hasAiIpc) {
  root.render(
    <React.StrictMode>
      <AIProvider>
        <App />
      </AIProvider>
    </React.StrictMode>,
  );
} else {
  // 开发/预览模式下不构造 ClientAIClient，避免其在 window.aiIPC 缺失时抛错
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
