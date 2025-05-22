import React, { useEffect, useState } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { useWaifuMessage } from '@/hooks/useWaifuMessage';

export const MessageBubble: React.FC = () => {
  const { state } = useLive2D();
  const [active, setActive] = useState(false);
  const { showMessage } = useWaifuMessage();

  // 当消息变化时，添加/移除活跃类
  useEffect(() => {
    if (state.currentMessage) {
      setActive(true);
    } else {
      // 为了动画效果，延迟移除活跃状态
      const timer = setTimeout(() => {
        setActive(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [state.currentMessage]);

  return (
    <div
      id="waifu-tips"
      className={`waifu-tips ${active ? 'waifu-tips-active' : ''}`}
      dangerouslySetInnerHTML={{ __html: state.currentMessage || '' }}
    />
  );
}; 