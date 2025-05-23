import React, { useRef, useEffect } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import { useWindowDrag } from '@/hooks/useWindowDrag';
import { loadExternalResource } from '@/utils/live2d-utils';
import logger from '@/utils/logger';

// 声明全局Live2D类型
declare global {
  interface Window {
    Live2D: any;
    Live2DMotion: any;
    AMotion: any;
    UtSystem: any;
    MotionQueueManager: any;
  }
}

export const Live2DCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, config, dispatch } = useLive2D();
  const { cubism2Model } = useLive2DModel();

  // 启用拖拽功能
  useWindowDrag('live2d');

  // 初始化canvas和加载Cubism库
  useEffect(() => {
    const initCanvas = async () => {
      if (!canvasRef.current || !config.cubism2Path) {
        console.log('Canvas或cubism2Path未准备好');
        return;
      }

      // 检查是否已经初始化过
      if (state.isInitialized) {
        console.log('Live2D库已经初始化，跳过重复初始化');
        return;
      }

      try {
        console.log('开始加载Cubism库:', config.cubism2Path);

        // 加载Cubism库(已增强，会等待库完全初始化)
        await loadExternalResource(config.cubism2Path, 'js');

        // 额外检查确保Live2D全局对象已经可用
        let attempts = 0;
        const maxAttempts = 50;

        const checkLive2DReady = () => {
          attempts++;
          console.log(`检查Live2D库是否就绪... (${attempts}/${maxAttempts})`);

          if (typeof window.Live2D !== 'undefined' &&
            typeof window.Live2DMotion !== 'undefined' &&
            typeof window.AMotion !== 'undefined') {
            console.log('Live2D库全局对象确认可用');
            logger.info('Cubism库加载成功');

            // 设置初始化状态
            dispatch({ type: 'SET_INITIALIZED', payload: true });
            console.log('Live2D初始化状态已设置为true');
          } else if (attempts < maxAttempts) {
            console.log('Live2D库尚未完全就绪，继续等待...');
            setTimeout(checkLive2DReady, 100);
          } else {
            console.error('Live2D库初始化超时');
            throw new Error('Live2D库初始化超时');
          }
        };

        // 开始检查Live2D是否就绪
        setTimeout(checkLive2DReady, 50);

      } catch (error) {
        console.error('加载Cubism库失败:', error);
        logger.error('加载Cubism库失败:', error);
        dispatch({
          type: 'SET_MESSAGE',
          payload: {
            text: '模型引擎加载失败，请刷新重试',
            priority: 100
          }
        });
      }
    };

    initCanvas();
  }, [config.cubism2Path, dispatch, state.isInitialized]);

  // 当模型或纹理ID变化时进行重绘
  useEffect(() => {
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