import React, { useRef, useEffect } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import { useWindowDrag } from '@/hooks/useWindowDrag';
import { loadExternalResource } from '@/utils/live2d-utils';
import logger from '@/utils/logger';

export const Live2DCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, config } = useLive2D();
  const { cubism2Model } = useLive2DModel();

  // 启用拖拽功能
  useWindowDrag('live2d');

  // 初始化canvas和加载Cubism库
  useEffect(() => {
    const initCanvas = async () => {
      if (!canvasRef.current || !config.cubism2Path) return;

      try {
        // 加载Cubism库
        await loadExternalResource(config.cubism2Path, 'js');
        logger.info('Cubism库加载成功');
      } catch (error) {
        logger.error('加载Cubism库失败:', error);
      }
    };

    initCanvas();
  }, [config.cubism2Path]);

  // 当模型或纹理ID变化时进行重绘
  useEffect(() => {
    // 这里可以添加额外的模型初始化或重绘逻辑
    // 实际的模型加载在useLive2DModel中处理
  }, [state.modelId, state.textureId]);

  return (
    <div id="waifu-canvas" className="waifu-canvas">
      <canvas
        id="live2d"
        ref={canvasRef}
        width="800"
        height="800"
        style={{
          width: '250px',
          height: '250px',
          position: 'absolute',
          bottom: '0',
          left: '0'
        }}
      />
    </div>
  );
}; 