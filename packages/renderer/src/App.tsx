import React, { useEffect, useState } from 'react';
import Live2dWidget from './components/Live2dWidget';
import type { ModelConfig } from './types/live2d';

const App: React.FC = () => {
  const [isElectron, setIsElectron] = useState(false);

  // 检测Electron环境
  useEffect(() => {
    // 检查window.electronAPI是否存在，确定是否在Electron环境中
    setIsElectron(!!window.electronAPI);
  }, []);

  // Live2D Widget配置
  const live2dConfig: ModelConfig = {
    waifuPath: './assets/waifu-tips.json', // 使用相对路径
    cubism2Path: isElectron ? './assets/live2d.min.js' : '/assets/live2d.min.js', // 在Electron中使用相对路径
    tools: ['switch-model', 'switch-texture', 'photo', 'info', 'toggle-top', 'quit'],
    logLevel: 'warn',
    drag: true,
  };

  return (
    <div className="app">
      <Live2dWidget config={live2dConfig} />
    </div>
  );
};

export default App; 