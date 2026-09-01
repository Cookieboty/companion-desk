import React from 'react';
import ReactDOM from 'react-dom/client';
import { AIProvider } from '@ig-live/ai-sdk-client/react';
import App from './App';

const hasAiIpc = typeof window !== 'undefined' && Boolean((window as { aiIPC?: unknown }).aiIPC);

if (!hasAiIpc) {
  console.warn('当前运行在开发模式：window.aiIPC 未就绪，将使用 Mock 数据');
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (hasAiIpc) {
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
