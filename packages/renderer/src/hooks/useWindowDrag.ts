import { useEffect } from 'react';

import { useMascot } from '@/contexts/MascotContext';

type DragStyle = CSSStyleDeclaration & { webkitAppRegion?: string; webkitUserDrag?: string };

/** 用 CSS `-webkit-app-region: drag` 让看板娘区域可以拖动窗口（无 JS 事件开销）。 */
export function useWindowDrag(elementId: string = 'mascot-canvas') {
  const { state } = useMascot();

  useEffect(() => {
    if (!state.dragEnabled) return;
    const el = document.getElementById(elementId);
    if (!el) return;
    const style = el.style as DragStyle;
    style.webkitAppRegion = 'drag';
    style.userSelect = 'none';
    style.webkitUserDrag = 'none';
    return () => {
      style.webkitAppRegion = '';
      style.userSelect = '';
      style.webkitUserDrag = '';
    };
  }, [state.dragEnabled, elementId]);

  return { isDragging: false };
}
