import { useCallback } from 'react';

import { useMascot } from '@/contexts/MascotContext';

/** 在看板娘气泡中显示消息（带优先级与自动消失）。 */
export function useWaifuMessage() {
  const { state, dispatch } = useMascot();

  const showMessage = useCallback(
    (text: string | string[], timeout = 3000, priority = 8, clearPrevious = false) => {
      if (!text || (Array.isArray(text) && text.length === 0)) return;
      if (!clearPrevious && state.currentMessage && state.messagePriority > priority) return;
      const selected = Array.isArray(text) ? text[Math.floor(Math.random() * text.length)] : text;
      if (clearPrevious) dispatch({ type: 'CLEAR_MESSAGE' });
      dispatch({ type: 'SET_MESSAGE', payload: { text: selected, priority, timeout } });
    },
    [state.currentMessage, state.messagePriority, dispatch],
  );

  return { showMessage };
}
