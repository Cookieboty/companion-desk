import React, { useEffect, useState } from 'react';
import { Live2DCanvas } from './Live2DCanvas';
import { MessageBubble } from './MessageBubble';
import { ToolBar } from './ToolBar';
import { LoadingIndicator } from './LoadingIndicator';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import { useWaifuMessage } from '@/hooks/useWaifuMessage';
import { useWindowDrag } from '@/hooks/useWindowDrag';
import { Live2DProvider } from '@/contexts/Live2DContext';
import { ModelConfig } from '@/types/live2d';
import './style.css';

export type Live2DProps = ModelConfig;

export const Live2D: React.FC<Live2DProps> = (props) => {
  const [initialized, setInitialized] = useState(true);
  const [loading, setLoading] = useState(false);

  // 扩展默认工具列表
  const defaultTools = [
    'hitokoto',
    'switch-model',
    'switch-texture',
    'photo',
    'asteroids',
    'info',
    'toggle-top',
    'quit'
  ];

  const mergedProps = {
    ...props,
    tools: props.tools || defaultTools
  };

  // 确保组件始终可见
  useEffect(() => {
    document.body.classList.add('waifu-body');

    // 确保容器立即显示
    const waifuElement = document.getElementById('waifu');
    if (waifuElement) {
      waifuElement.classList.add('waifu-active');
    }

    return () => {
      document.body.classList.remove('waifu-body');
    };
  }, []);

  return (
    <Live2DProvider config={mergedProps}>
      <div id="waifu" className="waifu-active">
        {loading && <LoadingIndicator />}
        <MessageBubble />
        <Live2DCanvas />
        <ToolBar />
      </div>
    </Live2DProvider>
  );
};

export default Live2D; 