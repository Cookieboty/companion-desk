import { useEffect, useRef } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import logger from '@/utils/logger';

interface DragState {
  isDragging: boolean;
  lastX: number;
  lastY: number;
}

export function useWindowDrag(canvasElementId: string = 'live2d') {
  const { state } = useLive2D();
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    lastX: 0,
    lastY: 0
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

    // 鼠标移动处理函数
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;

      // 计算相对移动距离
      const deltaX = e.screenX - dragStateRef.current.lastX;
      const deltaY = e.screenY - dragStateRef.current.lastY;

      // 如果鼠标没有移动，则不更新
      if (deltaX === 0 && deltaY === 0) return;

      // 更新上次鼠标位置
      dragStateRef.current.lastX = e.screenX;
      dragStateRef.current.lastY = e.screenY;

      // 使用相对移动，避免坐标累积错误
      try {
        if (electronAPI && electronAPI.moveWindow) {
          electronAPI.moveWindow(deltaX, deltaY);
        }
      } catch (err) {
        logger.error('移动窗口失败:', err);
        stopDragging();
      }
    };

    // 停止拖动
    const stopDragging = () => {
      dragStateRef.current.isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDragging);
    };

    // 开始拖动
    const startDragging = (e: MouseEvent) => {
      // 忽略右键点击
      if (e.button === 2) return;

      e.preventDefault();

      // 记录鼠标位置
      dragStateRef.current.lastX = e.screenX;
      dragStateRef.current.lastY = e.screenY;

      // 标记开始拖动
      dragStateRef.current.isDragging = true;

      // 添加事件监听
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopDragging);
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

      logger.info('拖动事件监听已移除');
    };
  }, [state.dragEnabled, canvasElementId]);

  return {
    isDragging: dragStateRef.current.isDragging
  };
}