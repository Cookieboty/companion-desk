import React, { useEffect, useState } from 'react';

import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';
import { useWaifuMessage } from '@/hooks/useWaifuMessage';

export const MessageBubble: React.FC = () => {
  const { state } = useMascot();
  const [active, setActive] = useState(false);

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
      id="waifu-tips-independent"
      className={`${styles.messageBubble} ${active ? styles.active : ''}`}
      dangerouslySetInnerHTML={{ __html: state.currentMessage || '' }}
    />
  );
};
