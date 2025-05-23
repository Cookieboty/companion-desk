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
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // 初始化Live2D组件
  useEffect(() => {
    // 配置初始化逻辑
    const initLive2D = async () => {
      setLoading(true);

      // 允许一些时间来加载资源和初始化
      setTimeout(() => {
        setLoading(false);
        setInitialized(true);
      }, 500);
    };

    // 执行初始化
    initLive2D();

    // 组件加载后立即显示主容器
    const waifuElement = document.getElementById('waifu');
    if (waifuElement) {
      setTimeout(() => {
        waifuElement.classList.add('waifu-active');
      }, 100);
    }
  }, []);

  // 确保组件始终可见
  useEffect(() => {
    document.body.classList.add('waifu-body');

    return () => {
      document.body.classList.remove('waifu-body');
    };
  }, []);

  return (
    <Live2DProvider config={mergedProps}>
      <div id="waifu" className={initialized ? 'waifu-active' : ''}>
        {loading && <LoadingIndicator />}
        <MessageBubble />
        <Live2DCanvas />
        <ToolBar />
      </div>
    </Live2DProvider>
  );
};

export default Live2D; 