import React from 'react';
import Live2D from './Live2D';
import type { Config } from '@/utils/model';

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
 * 
 * 这是一个包装组件，用于保持向后兼容性，同时使用重构后的React组件
 */
const Live2dWidget: React.FC<Live2dWidgetProps> = ({ config }) => {
  // 直接使用新重构的组件
  return (
    <Live2D
      waifuPath={config.waifuPath || ''}
      cdnPath={config.cdnPath}
      cubism2Path={config.cubism2Path || ''}
      tools={config.tools}
      drag={config.drag}
      logLevel={config.logLevel}
    />
  );
};

export default Live2dWidget; 