import React, { useEffect, useRef } from 'react';
import type { Config } from '../utils/model';

// 不需要在这里导入CSS，因为我们已经将它放在public目录中
// CSS会通过index.html中的link标签加载

// Live2D Widget React组件
interface Live2dWidgetProps {
  /**
   * 配置选项
   */
  config: Config;
}

/**
 * Live2D Widget React组件
 * 将Live2D看板娘集成到React应用中
 */
const Live2dWidget: React.FC<Live2dWidgetProps> = ({ config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef<boolean>(false);

  useEffect(() => {
    if (initialized.current) return;

    // 动态导入模块以避免SSR问题
    import('../utils/widget').then(({ initWidget }) => {
      if (!containerRef.current) return;

      // 初始化看板娘
      initWidget(config);
      initialized.current = true;
    });

    // 组件卸载时清理
    return () => {
      const waifu = document.getElementById('waifu');
      const waifuToggle = document.getElementById('waifu-toggle');

      if (waifu) {
        waifu.remove();
      }

      if (waifuToggle) {
        waifuToggle.remove();
      }

      // 清除本地存储中的相关项
      localStorage.removeItem('waifu-display');
      sessionStorage.removeItem('waifu-text');
    };
  }, [config]);

  return <div ref={containerRef} className="live2d-widget-container" />;
};

export default Live2dWidget; 