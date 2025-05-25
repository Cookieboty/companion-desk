import { useEffect } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import logger from '@/utils/logger';

export function useWindowDrag(canvasElementId: string = 'live2d') {
  const { state } = useLive2D();

  useEffect(() => {
    // 如果拖拽未启用，则不设置事件监听
    if (!state.dragEnabled) {
      return;
    }

    logger.info('正在设置CSS拖动区域');

    // 获取元素
    const dragElement = document.getElementById(canvasElementId);
    if (!dragElement) {
      logger.error(`无法找到ID为${canvasElementId}的元素，拖动设置失败`);
      return;
    }

    // 使用CSS -webkit-app-region 来实现拖拽，这是最高性能的方案
    // 不需要任何JavaScript事件处理，直接由Electron处理
    (dragElement.style as any).webkitAppRegion = 'drag';

    // 设置用户选择为none，避免拖拽时选中文本
    dragElement.style.userSelect = 'none';
    dragElement.style.webkitUserSelect = 'none';

    // 防止文本选择和拖拽冲突
    (dragElement.style as any).webkitUserDrag = 'none';
    (dragElement.style as any).userDrag = 'none';

    logger.info('CSS拖动区域设置成功');

    // 清理函数
    return () => {
      logger.info('正在清理CSS拖动区域');

      // 移除拖拽样式
      if (dragElement) {
        (dragElement.style as any).webkitAppRegion = '';
        dragElement.style.userSelect = '';
        dragElement.style.webkitUserSelect = '';
        (dragElement.style as any).webkitUserDrag = '';
        (dragElement.style as any).userDrag = '';
      }

      logger.info('CSS拖动区域已清理');
    };
  }, [state.dragEnabled, canvasElementId]);

  return {
    isDragging: false // CSS拖拽不需要状态管理
  };
}