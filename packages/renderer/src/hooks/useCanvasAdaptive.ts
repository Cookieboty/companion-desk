import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { AdaptiveParams, ViewBounds, AdaptiveCacheItem } from '@/types/adaptive';
import logger from '@/utils/logger';

// 防抖Hook
function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;
}

// 自适应缓存管理
class AdaptiveCache {
  private cache = new Map<string, AdaptiveCacheItem>();
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  private generateKey(
    canvasWidth: number,
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): string {
    return `${canvasWidth}x${canvasHeight}_${displayWidth}x${displayHeight}`;
  }

  get(
    canvasWidth: number,
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): AdaptiveParams | null {
    const key = this.generateKey(canvasWidth, canvasHeight, displayWidth, displayHeight);
    const item = this.cache.get(key);

    if (item) {
      // 检查缓存是否过期（5分钟）
      if (Date.now() - item.timestamp < 5 * 60 * 1000) {
        return item.params;
      } else {
        this.cache.delete(key);
      }
    }

    return null;
  }

  set(
    canvasWidth: number,
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number,
    params: AdaptiveParams
  ): void {
    const key = this.generateKey(canvasWidth, canvasHeight, displayWidth, displayHeight);

    // 如果缓存已满，删除最旧的项
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      params,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export function useCanvasAdaptive(
  containerRef: RefObject<HTMLElement>,
  cubism2Model?: any
) {
  const { state, dispatch } = useLive2D();
  const [adaptiveParams, setAdaptiveParams] = useState<AdaptiveParams | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 800 });
  const cacheRef = useRef(new AdaptiveCache(state.adaptiveConfig.cacheSize));

  // Canvas自适应模型尺寸的处理函数
  const handleCanvasAdaptToModel = useCallback((containerWidth: number) => {
    if (!cubism2Model) return;

    // 获取模型原始尺寸
    const modelSize = cubism2Model.getModelCanvasSize();
    if (!modelSize) {
      logger.warn('无法获取模型原始尺寸');
      return;
    }

    // 计算适合的Canvas尺寸
    const adaptiveSize = cubism2Model.calculateAdaptiveCanvasSize(containerWidth);
    if (!adaptiveSize) {
      logger.warn('无法计算自适应Canvas尺寸');
      return;
    }

    // 更新Canvas尺寸状态
    setCanvasSize(adaptiveSize);

    // 更新全局状态
    dispatch({ type: 'SET_CANVAS_SIZE', payload: adaptiveSize });
    dispatch({
      type: 'SET_DISPLAY_SIZE', payload: {
        width: containerWidth,
        height: adaptiveSize.height
      }
    });

    // 应用到Cubism2Model
    const success = cubism2Model.applyAdaptiveCanvasSize(containerWidth);

    if (success) {
      logger.info('Canvas已自适应模型尺寸:', {
        modelSize,
        containerWidth,
        adaptiveSize
      });
    }
  }, [cubism2Model, dispatch]);

  // 计算视图边界
  const calculateViewBounds = useCallback((aspectRatio: number): ViewBounds => {
    const config = state.adaptiveConfig;

    // 基于原始逻辑，但进行适当扩展
    const left = -1;
    const right = 1;

    if (aspectRatio > 1) {
      // 横屏：扩展垂直范围以适应宽屏
      const ratio = 1 / aspectRatio;
      return {
        left,
        right,
        bottom: -ratio * config.verticalExpansion,
        top: ratio * config.verticalExpansion
      };
    } else {
      // 竖屏或正方形：保持原始比例
      const ratio = aspectRatio;
      return {
        left,
        right,
        bottom: -ratio,
        top: ratio
      };
    }
  }, [state.adaptiveConfig]);

  // 计算模型缩放
  const calculateModelScale = useCallback((
    canvasWidth: number,
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): number => {
    const config = state.adaptiveConfig;

    // 基础缩放：确保模型适合显示区域
    let scale = config.baseScale;

    // 根据显示尺寸相对于基准尺寸(250x250)的比例调整
    const displayAspect = displayWidth / displayHeight;
    const sizeScale = Math.min(displayWidth / 250, displayHeight / 250);

    // 应用尺寸缩放因子
    scale *= Math.pow(sizeScale, config.sizeScaleFactor);

    // 根据宽高比进行微调
    if (displayAspect > 1.5) {
      // 超宽屏：适当缩小
      scale *= config.wideScreenScale;
    } else if (displayAspect < 0.7) {
      // 超高屏：适当放大
      scale *= config.tallScreenScale;
    }

    // 限制在合理范围内
    return Math.max(config.minScale, Math.min(config.maxScale, scale));
  }, [state.adaptiveConfig]);

  // 计算模型位置
  const calculateModelPosition = useCallback((aspectRatio: number): { x: number; y: number } => {
    const config = state.adaptiveConfig;
    const rules = config.aspectRatioRules;

    // 根据宽高比应用位置规则
    if (aspectRatio >= rules.ultraWide.threshold) {
      return { x: rules.ultraWide.offsetX, y: rules.ultraWide.offsetY };
    } else if (aspectRatio >= rules.wide.threshold) {
      return { x: rules.wide.offsetX, y: rules.wide.offsetY };
    } else if (aspectRatio >= rules.square.threshold) {
      return { x: rules.square.offsetX, y: rules.square.offsetY };
    } else if (aspectRatio >= rules.tall.threshold) {
      return { x: rules.tall.offsetX, y: rules.tall.offsetY };
    } else {
      return { x: rules.ultraTall.offsetX, y: rules.ultraTall.offsetY };
    }
  }, [state.adaptiveConfig]);

  // 计算自适应参数
  const calculateAdaptiveParams = useCallback((
    canvasWidth: number,
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): AdaptiveParams => {
    // 检查缓存
    if (state.adaptiveConfig.enableCache) {
      const cached = cacheRef.current.get(canvasWidth, canvasHeight, displayWidth, displayHeight);
      if (cached) {
        if (state.adaptiveConfig.logAdaptiveChanges) {
          logger.trace('使用缓存的自适应参数');
        }
        return cached;
      }
    }

    const canvasAspect = canvasWidth / canvasHeight;
    const displayAspect = displayWidth / displayHeight;

    // 计算各项参数
    const viewBounds = calculateViewBounds(displayAspect);
    const modelScale = calculateModelScale(canvasWidth, canvasHeight, displayWidth, displayHeight);
    const modelPosition = calculateModelPosition(displayAspect);

    const params: AdaptiveParams = {
      viewBounds,
      modelScale,
      modelPosition
    };

    // 缓存结果
    if (state.adaptiveConfig.enableCache) {
      cacheRef.current.set(canvasWidth, canvasHeight, displayWidth, displayHeight, params);
    }

    if (state.adaptiveConfig.logAdaptiveChanges) {
      logger.info('计算自适应参数:', {
        canvasSize: { width: canvasWidth, height: canvasHeight },
        displaySize: { width: displayWidth, height: displayHeight },
        params
      });
    }

    return params;
  }, [state.adaptiveConfig, calculateViewBounds, calculateModelScale, calculateModelPosition]);

  // 处理Canvas尺寸变化
  const handleCanvasResize = useCallback((rect: DOMRectReadOnly) => {
    const { width } = rect;

    if (state.adaptiveConfig.enabled && cubism2Model) {
      // 使用Canvas自适应模型尺寸的新方法
      handleCanvasAdaptToModel(width);
    } else {
      // 传统方法：固定高度
      const { height } = rect;

      // 更新显示尺寸
      dispatch({ type: 'SET_DISPLAY_SIZE', payload: { width, height } });

      // 计算Canvas内部尺寸（保持高DPI）
      const dpr = window.devicePixelRatio || 1;
      const canvasWidth = Math.floor(width * dpr);
      const canvasHeight = Math.floor(height * dpr);

      // 更新Canvas尺寸
      setCanvasSize({ width: canvasWidth, height: canvasHeight });
      dispatch({ type: 'SET_CANVAS_SIZE', payload: { width: canvasWidth, height: canvasHeight } });

      // 计算新的自适应参数
      if (state.isAdaptiveEnabled && state.adaptiveConfig.enabled) {
        const newParams = calculateAdaptiveParams(canvasWidth, canvasHeight, width, height);
        setAdaptiveParams(newParams);
      }
    }
  }, [dispatch, state.isAdaptiveEnabled, state.adaptiveConfig.enabled, calculateAdaptiveParams, cubism2Model, handleCanvasAdaptToModel]);

  // 防抖处理的尺寸变化处理器
  const debouncedHandleResize = useDebounce(handleCanvasResize, state.adaptiveConfig.debounceDelay);

  // ResizeObserver监听
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        debouncedHandleResize(entry.contentRect);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, debouncedHandleResize]);

  // 初始化时计算自适应参数
  useEffect(() => {
    if (containerRef.current && cubism2Model) {
      const rect = containerRef.current.getBoundingClientRect();
      handleCanvasResize(rect);
    }
  }, [containerRef, cubism2Model, handleCanvasResize]);

  // 当自适应配置变化时，清除缓存并重新计算
  useEffect(() => {
    if (state.adaptiveConfig.enableCache) {
      cacheRef.current = new AdaptiveCache(state.adaptiveConfig.cacheSize);
    } else {
      cacheRef.current.clear();
    }

    // 重新计算当前参数
    if (state.isAdaptiveEnabled && state.adaptiveConfig.enabled) {
      const newParams = calculateAdaptiveParams(
        state.canvasSize.width,
        state.canvasSize.height,
        state.displaySize.width,
        state.displaySize.height
      );
      setAdaptiveParams(newParams);
    }
  }, [state.adaptiveConfig, state.isAdaptiveEnabled, calculateAdaptiveParams, state.canvasSize, state.displaySize]);

  return {
    adaptiveParams,
    calculateAdaptiveParams,
    canvasSize,
    isAdaptiveEnabled: state.isAdaptiveEnabled && state.adaptiveConfig.enabled
  };
} 