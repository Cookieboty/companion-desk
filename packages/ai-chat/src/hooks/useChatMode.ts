/**
 * 普通 / 开发模式偏好（React 订阅）。
 */
import { useCallback, useSyncExternalStore } from 'react';

import {
  getChatMode,
  setChatMode as persistChatMode,
  subscribeChatMode,
  type ChatMode,
} from '../services/chatPrefs';

export function useChatMode(): {
  mode: ChatMode;
  isDev: boolean;
  isNormal: boolean;
  setMode: (m: ChatMode) => void;
  toggle: () => void;
} {
  const mode = useSyncExternalStore(subscribeChatMode, getChatMode, () => 'normal' as ChatMode);
  const setMode = useCallback((m: ChatMode) => persistChatMode(m), []);
  const toggle = useCallback(() => persistChatMode(mode === 'normal' ? 'dev' : 'normal'), [mode]);
  return {
    mode,
    isDev: mode === 'dev',
    isNormal: mode === 'normal',
    setMode,
    toggle,
  };
}
