import React, { useRef, useEffect } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import { useWindowDrag } from '@/hooks/useWindowDrag';
import { loadExternalResource } from '@/utils/live2d-utils';
import logger from '@/utils/logger';
import styles from './style.module.css';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, config, dispatch } = useLive2D();
  const { cubism2Model } = useLive2DModel();

  // 固定Canvas尺寸为300x300
  const CANVAS_SIZE = 300;

  // 当模型加载完成时，设置Canvas尺寸
  useEffect(() => {
    if (cubism2Model) {
      cubism2Model.setupCanvasSize(CANVAS_SIZE, CANVAS_SIZE);
    }
  }, [cubism2Model]);

  // 启用拖拽功能
  useWindowDrag('live2d');

  useEffect(() => {
    const initCanvas = async () => {
      try {
        // 加载Cubism2库
        await loadExternalResource(config.cubism2Path || '', 'js');

        // 检查Live2D是否成功加载
        if (typeof window.Live2D === 'undefined') {
          throw new Error('Live2D库加载失败');
        }

        // 初始化Live2D
        window.Live2D.init();

        // 禁用Live2D库的调试日志输出
        if (typeof (window as any).Q !== 'undefined' && typeof (window as any).Q._$so !== 'undefined') {
          (window as any).Q._$so = false;
          logger.info('Live2D调试日志已禁用');
        }

        logger.info('Live2D引擎初始化成功');

        dispatch({
          type: 'SET_INITIALIZED',
          payload: true
        });

        dispatch({
          type: 'SET_MESSAGE',
          payload: {
            text: '看板娘加载完成！',
            priority: 1
          }
        });

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
  }, [config.cubism2Path, dispatch]);

  return (
    <div
      ref={containerRef}
      id="waifu-canvas"
      className={styles.waifuCanvas}
    >
      <canvas
        id="live2d"
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{
          width: `${CANVAS_SIZE}px`,
          height: `${CANVAS_SIZE}px`,
          position: 'relative',
          display: 'block',
          background: 'transparent',
          backgroundColor: 'transparent'
        }}
      />
    </div>
  );
}; 