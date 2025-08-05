import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 检查是否在Electron环境中
const isElectron = typeof window !== 'undefined' && window.electronAPI;

if (!isElectron) {
  console.warn('当前运行在开发模式，使用Mock数据');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 