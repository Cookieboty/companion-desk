import { useEffect, useRef } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import logger from '@/utils/logger';

interface DragState {
  isDragging: boolean;
  initialX: number;
  initialY: number;
  lastX: number;
  lastY: number;
  windowX: number;
  windowY: number;
  animationFrameId: number | null;
}

export function useWindowDrag(canvasElementId: string = 'live2d') {
  const { state } = useLive2D();
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    initialX: 0,
    initialY: 0,
    lastX: 0,
    lastY: 0,
    windowX: 0,
    windowY: 0,
    animationFrameId: null
  });

  useEffect(() => {
    // 如果拖拽未启用，则不设置事件监听
    if (!state.dragEnabled) {
      return;
    }

    logger.info('正在注册拖动事件');

    // 获取元素
    const dragElement = document.getElementById(canvasElementId);
    if (!dragElement) {
      logger.error(`无法找到ID为${canvasElementId}的元素，拖动注册失败`);
      return;
    }

    // 获取全局电子API
    const electronAPI = (window as any).electronAPI;

    // 初始化时尝试获取当前窗口位置
    const initPosition = async () => {
      try {
        if (electronAPI?.getPosition) {
          const position = await electronAPI.getPosition();
          if (Array.isArray(position) && position.length === 2) {
            dragStateRef.current.windowX = position[0];
            dragStateRef.current.windowY = position[1];
          }
        }
      } catch (err) {
        logger.error('获取初始窗口位置失败:', err);
      }
    };

    // 立即执行获取初始位置
    initPosition();

    // 移动动画函数
    const moveWindow = () => {
      if (!dragStateRef.current.isDragging) return;

      try {
        if (electronAPI && electronAPI.setPosition) {
          // 确保坐标为整数
          const newX = Math.round(dragStateRef.current.windowX);
          const newY = Math.round(dragStateRef.current.windowY);

          // 发送位置更新
          electronAPI.setPosition(newX, newY);
        }
      } catch (err) {
        logger.error('设置窗口位置失败:', err);
        stopDragging();
      }
    };

    // 鼠标移动处理函数
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;

      // 计算移动距离
      const deltaX = e.screenX - dragStateRef.current.lastX;
      const deltaY = e.screenY - dragStateRef.current.lastY;

      // 如果鼠标没有移动，则不更新
      if (deltaX === 0 && deltaY === 0) return;

      // 更新窗口位置
      dragStateRef.current.windowX += deltaX;
      dragStateRef.current.windowY += deltaY;

      // 更新上次鼠标位置
      dragStateRef.current.lastX = e.screenX;
      dragStateRef.current.lastY = e.screenY;
    };

    // 停止拖动
    const stopDragging = () => {
      dragStateRef.current.isDragging = false;

      if (dragStateRef.current.animationFrameId !== null) {
        cancelAnimationFrame(dragStateRef.current.animationFrameId);
        dragStateRef.current.animationFrameId = null;
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDragging);
    };

    // 动画循环
    const animationLoop = () => {
      moveWindow();

      if (dragStateRef.current.isDragging) {
        dragStateRef.current.animationFrameId = requestAnimationFrame(animationLoop);
      }
    };

    // 开始拖动
    const startDragging = async (e: MouseEvent) => {
      // 忽略右键点击
      if (e.button === 2) return;

      e.preventDefault();

      // 获取最新窗口位置
      try {
        if (electronAPI?.getPosition) {
          const position = await electronAPI.getPosition();
          if (Array.isArray(position) && position.length === 2) {
            dragStateRef.current.windowX = position[0];
            dragStateRef.current.windowY = position[1];
          }
        }
      } catch (err) {
        logger.error('获取窗口位置失败:', err);
      }

      // 记录鼠标初始位置
      dragStateRef.current.initialX = e.screenX;
      dragStateRef.current.lastX = e.screenX;
      dragStateRef.current.initialY = e.screenY;
      dragStateRef.current.lastY = e.screenY;

      // 标记开始拖动
      dragStateRef.current.isDragging = true;

      // 添加事件监听
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopDragging);

      // 启动动画循环
      dragStateRef.current.animationFrameId = requestAnimationFrame(animationLoop);
    };

    // 注册鼠标按下事件
    dragElement.addEventListener('mousedown', startDragging);

    logger.info('拖动事件注册成功');

    // 清理函数
    return () => {
      logger.info('正在清理拖动事件');

      dragElement.removeEventListener('mousedown', startDragging);

      // 确保停止所有正在进行的拖动操作
      if (dragStateRef.current.isDragging) {
        stopDragging();
      }

      if (dragStateRef.current.animationFrameId !== null) {
        cancelAnimationFrame(dragStateRef.current.animationFrameId);
        dragStateRef.current.animationFrameId = null;
      }

      logger.info('拖动事件监听已移除');
    };
  }, [state.dragEnabled, canvasElementId]);

  return {
    isDragging: dragStateRef.current.isDragging
  };
} 