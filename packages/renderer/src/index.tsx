import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 创建根元素
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// 渲染应用
root.render(<App />); 