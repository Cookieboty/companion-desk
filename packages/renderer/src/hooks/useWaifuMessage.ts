import { useCallback, useEffect, useRef } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { randomSelection } from '@/utils/live2d-utils';
import { Time } from '@/types/live2d';

// 显示消息的hook
export function useWaifuMessage() {
  const { state, dispatch } = useLive2D();
  const userActionRef = useRef(false);
  const userActionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHoverElementRef = useRef<string | null>(null);

  // 显示消息
  const showMessage = useCallback((
    text: string | string[],
    timeout: number = 3000, // 默认3秒自动关闭
    priority: number = 8,
    clearPrevious: boolean = false
  ) => {
    // 如果没有文本或者当前消息优先级更高，则不显示
    if (!text || (!clearPrevious && state.currentMessage && state.messagePriority > priority)) {
      return;
    }

    // 随机选择一条消息
    const selectedText = Array.isArray(text) ? text[Math.floor(Math.random() * text.length)] : text;

    // 如果需要立即清除之前的消息
    if (clearPrevious) {
      // 先清空当前消息
      dispatch({ type: 'CLEAR_MESSAGE' });

      // 短暂延迟后再显示新消息
      setTimeout(() => {
        dispatch({
          type: 'SET_MESSAGE',
          payload: { text: selectedText, priority, timeout }
        });
      }, 100);
    } else {
      // 直接显示新消息，让Live2DContext的增强dispatch处理自动关闭
      dispatch({
        type: 'SET_MESSAGE',
        payload: { text: selectedText, priority, timeout }
      });
    }
  }, [state.currentMessage, state.messagePriority, dispatch]);

  // 根据时间显示欢迎消息
  const welcomeMessage = useCallback((time: Time, template: string): string => {
    const now = new Date();

    // 检查当前时间是否在配置的时间段内
    for (const { hour, text } of time) {
      const [after, before] = hour.split('-');
      if (Number(after) <= now.getHours() && now.getHours() <= Number(before || after)) {
        return text;
      }
    }

    // 默认欢迎消息
    const text = template.replace(/\$1/g, document?.title || '');

    // 检查来源
    if (document.referrer !== '') {
      const referrer = new URL(document.referrer);
      const domain = referrer.hostname.split('.')[1];

      // 常见搜索引擎域名映射
      const domains: Record<string, string> = {
        baidu: '百度',
        so: '360搜索',
        google: '谷歌搜索'
      };

      // 如果是从同域名来的，直接返回默认欢迎信息
      if (location.hostname === referrer.hostname) return text;

      // 显示来源信息
      const from = domain in domains ? domains[domain] : referrer.hostname;
      return `Hello！来自 <span>${from}</span> 的朋友<br>${text}`;
    }

    return text;
  }, []);

  // 注册用户活动检测
  useEffect(() => {
    const handleUserActivity = () => {
      userActionRef.current = true;
    };

    // 添加事件监听
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);

    // 定期检查用户活动状态
    const checkInterval = setInterval(() => {
      if (userActionRef.current) {
        userActionRef.current = false;

        if (userActionTimerRef.current) {
          clearInterval(userActionTimerRef.current);
          userActionTimerRef.current = null;
        }
      } else if (!userActionTimerRef.current) {
        // 如果用户一段时间不活动，显示随机消息
        userActionTimerRef.current = setInterval(() => {
          // 这里应该从配置中获取默认消息数组
          // 暂时使用一个固定的消息数组作为示例
          const defaultMessages = [
            '好久不见了呢',
            '你好呀~',
            '有什么可以帮到你的吗？',
            '无聊的话，要不要和我聊聊天？'
          ];
          showMessage(defaultMessages, 6000, 9);
        }, 20000);
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      clearInterval(checkInterval);

      if (userActionTimerRef.current) {
        clearInterval(userActionTimerRef.current);
      }
    };
  }, [showMessage]);

  // 注册鼠标悬停事件监听
  const registerMouseoverEvents = useCallback((events: Array<{ selector: string, text: string | string[] }>) => {
    const handleMouseover = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      for (const { selector, text } of events) {
        if (!target.closest(selector)) continue;

        if (lastHoverElementRef.current === selector) return;

        lastHoverElementRef.current = selector;

        // 替换文本中的{text}占位符
        let displayText = randomSelection(text);
        if (typeof displayText === 'string') {
          displayText = displayText.replace('{text}', target.innerText);
        }

        showMessage(displayText, 4000, 8);
        return;
      }
    };

    window.addEventListener('mouseover', handleMouseover);

    return () => {
      window.removeEventListener('mouseover', handleMouseover);
    };
  }, [showMessage]);

  // 注册鼠标点击事件监听
  const registerClickEvents = useCallback((events: Array<{ selector: string, text: string | string[] }>) => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      for (const { selector, text } of events) {
        if (!target.closest(selector)) continue;

        // 替换文本中的{text}占位符
        let displayText = randomSelection(text);
        if (typeof displayText === 'string') {
          displayText = displayText.replace('{text}', target.innerText);
        }

        showMessage(displayText, 4000, 8);
        return;
      }
    };

    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('click', handleClick);
    };
  }, [showMessage]);

  // 注册季节性消息
  const registerSeasonalMessages = useCallback((seasons: Array<{ date: string, text: string | string[] }>) => {
    const now = new Date();
    const seasonalMessages: string[] = [];

    seasons.forEach(({ date, text }) => {
      const [after, before] = date.split('-');
      const [afterMonth, afterDay] = after.split('/').map(Number);
      const [beforeMonth, beforeDay] = (before || after).split('/').map(Number);

      if (
        afterMonth <= now.getMonth() + 1 &&
        now.getMonth() + 1 <= beforeMonth &&
        afterDay <= now.getDate() &&
        now.getDate() <= beforeDay
      ) {
        let message = randomSelection(text);
        if (typeof message === 'string') {
          message = message.replace('{year}', String(now.getFullYear()));
        }
        seasonalMessages.push(message);
      }
    });

    return seasonalMessages;
  }, []);

  // 注册特殊事件（控制台、复制和可见性变化）
  const registerSpecialEvents = useCallback((consoleMessage: string, copyMessage: string, visibilityMessage: string) => {
    // 控制台事件
    const consoleHandler = () => { };
    consoleHandler.toString = () => {
      showMessage(consoleMessage, 6000, 9);
      return '';
    };
    console.log('%c', consoleHandler);

    // 复制事件
    const handleCopy = () => {
      showMessage(copyMessage, 6000, 9);
    };
    window.addEventListener('copy', handleCopy);

    // 可见性变化事件
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        showMessage(visibilityMessage, 6000, 9);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showMessage]);

  return {
    showMessage,
    welcomeMessage,
    registerMouseoverEvents,
    registerClickEvents,
    registerSeasonalMessages,
    registerSpecialEvents
  };
} 