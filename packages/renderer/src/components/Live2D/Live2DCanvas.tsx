import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import { useWindowDrag } from '@/hooks/useWindowDrag';
import { useCanvasAdaptive } from '@/hooks/useCanvasAdaptive';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, config, dispatch } = useLive2D();
  const { cubism2Model } = useLive2DModel();
  const { adaptiveParams, canvasSize, isAdaptiveEnabled } = useCanvasAdaptive(containerRef, cubism2Model);

  // 计算适合的Canvas尺寸
  const calculateCanvasSize = useCallback(() => {
    if (!cubism2Model) return { width: 800, height: 800 };

    const modelSize = cubism2Model.getModelCanvasSize();
    if (!modelSize) return { width: 800, height: 800 };

    const modelAspect = modelSize.width / modelSize.height;

    // 对于高瘦模型，使用更合适的Canvas尺寸，确保有足够高度
    if (modelAspect < 0.6) {
      // 非常高的模型：使用更高的Canvas，确保模型和工具栏都能完整显示
      return { width: 500, height: 1200 }; // 增加高度
    } else if (modelAspect < 0.8) {
      // 较高的模型
      return { width: 600, height: 1000 };
    } else {
      // 正常比例的模型
      return { width: 800, height: 800 };
    }
  }, [cubism2Model]);

  const [dynamicCanvasSize, setDynamicCanvasSize] = useState({ width: 800, height: 800 });

  // 当模型加载后更新Canvas尺寸
  useEffect(() => {
    if (cubism2Model) {
      const newSize = calculateCanvasSize();
      setDynamicCanvasSize(newSize);

      // 更新全局状态
      dispatch({ type: 'SET_CANVAS_SIZE', payload: newSize });
    }
  }, [cubism2Model, calculateCanvasSize, dispatch]);

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

        // 禁用Live2D库的调试日志输出，避免控制台被大量调试信息刷屏
        // Q._$so 是Live2D库内部的调试标志，设置为false可以禁用调试日志
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
  }, [config.cubism2Path, dispatch, state.isInitialized]);

  // 应用自适应参数到Cubism2Model
  useEffect(() => {
    if (cubism2Model && adaptiveParams && isAdaptiveEnabled) {
      cubism2Model.updateAdaptiveLayout(
        state.canvasSize.width,
        state.canvasSize.height,
        state.displaySize.width,
        state.displaySize.height
      );
    }
  }, [cubism2Model, adaptiveParams, isAdaptiveEnabled, state.canvasSize, state.displaySize]);

  // 当自适应配置变化时，更新Cubism2Model的配置
  useEffect(() => {
    if (cubism2Model) {
      cubism2Model.updateAdaptiveConfig(state.adaptiveConfig);
      cubism2Model.setAdaptiveMode(state.isAdaptiveEnabled);
    }
  }, [cubism2Model, state.adaptiveConfig, state.isAdaptiveEnabled]);

  // 当模型或纹理ID变化时进行重绘
  useEffect(() => {
    // 实际的模型加载在useLive2DModel中处理
  }, [state.modelId, state.textureId]);

  // 测试自适应功能的函数
  const testAdaptive = () => {
    if (cubism2Model && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      console.log('手动触发自适应测试:', {
        containerSize: { width: rect.width, height: rect.height },
        canvasSize: canvasSize,
        displaySize: state.displaySize,
        isAdaptiveEnabled,
        modelCanvasSize: cubism2Model.getModelCanvasSize()
      });

      // 如果启用了自适应，强制重新计算Canvas尺寸
      if (state.adaptiveConfig.enabled) {
        const success = cubism2Model.applyAdaptiveCanvasSize(rect.width);
        console.log('Canvas自适应结果:', success);
      } else {
        // 强制更新自适应布局
        cubism2Model.updateAdaptiveLayout(
          state.canvasSize.width,
          state.canvasSize.height,
          rect.width,
          rect.height
        );
      }
    }
  };

  return (
    <div
      ref={containerRef}
      id="waifu-canvas"
      className="waifu-canvas"
    >
      <canvas
        id="live2d"
        ref={canvasRef}
        width={dynamicCanvasSize.width}
        height={dynamicCanvasSize.height}
        style={{
          width: '250px',
          height: `${250 * (dynamicCanvasSize.height / dynamicCanvasSize.width)}px`,
          position: 'relative',
          display: 'block'
        }}
      />
      {/* {state.adaptiveConfig.showDebugInfo && (
        <div className="waifu-adaptive-debug">
          Canvas: {dynamicCanvasSize.width}×{dynamicCanvasSize.height}<br />
          Display: 250×{Math.round(250 * (dynamicCanvasSize.height / dynamicCanvasSize.width))}<br />
          Model: {cubism2Model?.getModelCanvasSize() ?
            `${cubism2Model.getModelCanvasSize().width}×${cubism2Model.getModelCanvasSize().height}` :
            'N/A'}<br />
          Adaptive: {isAdaptiveEnabled ? 'ON' : 'OFF'}<br />
          <button onClick={testAdaptive} style={{ fontSize: '10px', padding: '2px 4px' }}>
            Test Adaptive
          </button>
        </div>
      )} */}
    </div>
  );
}; 