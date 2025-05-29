import React, { useEffect, useState } from 'react';
import { Live2DCanvas } from './Live2DCanvas';
import { MessageBubble } from '../MessageBubble/MessageBubble';
import { LoadingIndicator } from './LoadingIndicator';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import { useWaifuMessage } from '@/hooks/useWaifuMessage';
import { useWindowDrag } from '@/hooks/useWindowDrag';
import { Live2DProvider } from '@/contexts/Live2DContext';
import { ModelConfig } from '@/types/live2d';
import styles from './style.module.css';
import { ToolBar } from '../ToolBar';

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

  // // 确保组件始终可见
  // useEffect(() => {
  //   // 确保容器立即显示
  //   const waifuElement = document.getElementById('waifu');
  //   if (waifuElement) {
  //     waifuElement.classList.add('waifu-active');
  //   }
  // }, []);

  return (
    <Live2DProvider config={mergedProps}>
      {/* 消息气泡独立定位，不影响看板娘主体 */}
      <MessageBubble />

      {/* 独立的工具栏组件 - 完全不影响Live2D */}
      <ToolBar />

      {/* 看板娘主体容器 - 保持完全透明 */}
      <div id="waifu" className={styles.waifu}>
        {/* {loading && <LoadingIndicator />} */}
        <Live2DCanvas />
      </div>
    </Live2DProvider>
  );
};

export default Live2D; 