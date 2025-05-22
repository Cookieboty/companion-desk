import React from 'react';
import Live2dWidget from './components/Live2dWidget';
import type { Config } from './utils/model';

const App: React.FC = () => {
  // Live2D Widget配置
  const live2dConfig: Config = {
    waifuPath: '/assets/waifu-tips.json',
    cdnPath: 'https://fastly.jsdelivr.net/gh/fghrsh/live2d_api/',
    cubism2Path: '/assets/live2d.min.js',
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