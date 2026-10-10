import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';
import { bubbleScale, placeBubble, type BubblePlacement } from '@/mascot/bubblePlacement';
import { layoutStore } from '@/mascot/layoutStore';
import { toBubbleText } from '@/security/bubbleText';

const PREF_W = 220;

/**
 * 看板娘气泡。
 * - 只渲染纯文本（React 文本节点；见 security/bubbleText）。
 * - 位置跟随头部：放在头顶 / 头侧 / 肩下，永不压住脸，避开工具栏槽位，贴屏幕边缘时换边；
 *   尾巴指向头部。长文本在最大高度内滚动。
 * - AI 回复被截短时显示「查看全文」→ 打开对话窗口。
 */
export const MessageBubble: React.FC = () => {
  const { state } = useMascot();
  const [active, setActive] = useState(false);
  const [place, setPlace] = useState<BubblePlacement | null>(null);
  const [scale, setScale] = useState(1);
  const measureRef = useRef<HTMLDivElement>(null);
  const text = toBubbleText(state.currentMessage);
  const more = state.messageMore === true;

  useEffect(() => {
    if (state.currentMessage) {
      setActive(true);
      return undefined;
    }
    const timer = setTimeout(() => setActive(false), 300);
    return () => clearTimeout(timer);
  }, [state.currentMessage]);

  const compute = useCallback(() => {
    const { head, gutter } = layoutStore.get();
    const el = measureRef.current;
    if (!head || !el) {
      setPlace(null);
      return;
    }
    const vh = window.innerHeight;
    const maxH = Math.round(Math.min(vh * 0.45, 200));
    const p = placeBubble({
      head,
      gutter,
      view: { width: window.innerWidth, height: vh },
      prefWidth: PREF_W,
      screen: {
        winX: window.screenX,
        availLeft: (window.screen as Screen & { availLeft?: number }).availLeft ?? 0,
        availWidth: window.screen.availWidth,
      },
      measure: (w) => {
        el.style.width = `${w}px`;
        return Math.min(el.offsetHeight, maxH);
      },
    });
    setScale(bubbleScale(head));
    setPlace((prev) =>
      prev &&
      prev.candidate === p.candidate &&
      Math.abs(prev.x - p.x) < 4 &&
      Math.abs(prev.y - p.y) < 4 &&
      prev.width === p.width &&
      prev.height === p.height
        ? prev
        : p,
    );
  }, []);

  useLayoutEffect(() => {
    compute();
  }, [compute, text, more, scale]);

  useEffect(() => {
    const off = layoutStore.subscribe(() => compute());
    window.addEventListener('resize', compute);
    const t = setInterval(compute, 1000); // 窗口被拖到屏幕边缘时重新判断
    return () => {
      off();
      window.removeEventListener('resize', compute);
      clearInterval(t);
    };
  }, [compute]);

  useEffect(() => {
    document.documentElement.dataset.bubbleCandidate = place?.candidate ?? 'fixed';
  }, [place]);

  const openChat = () => {
    void window.electronAPI?.openAiChat?.();
  };

  const style: React.CSSProperties & Record<string, string | number> = place
    ? {
        left: place.x,
        top: place.y,
        width: place.width,
        '--bubble-max-h': `${place.height}px`,
        '--tail-offset': `${place.tailOffset}px`,
        '--bubble-scale': scale,
      }
    : {};

  const body = (measure: boolean) => (
    <div className={styles.scroll}>
      <span className={styles.text}>{text}</span>
      {more && (
        <button
          type="button"
          className={styles.more}
          data-testid={measure ? undefined : 'bubble-see-more'}
          tabIndex={measure ? -1 : undefined}
          onClick={openChat}
        >
          查看全文
        </button>
      )}
    </div>
  );

  return (
    <>
      <div
        id="waifu-tips-independent"
        data-mascot-ui={active ? '' : undefined}
        data-testid="mascot-bubble"
        data-tail={place?.tail ?? 'bottom'}
        role="status"
        aria-live="polite"
        className={`${styles.messageBubble} ${place ? styles.placed : ''} ${active ? styles.active : ''}`}
        style={style}
      >
        {body(false)}
      </div>
      {/* 隐藏的测量层：同样式，用来求给定宽度下的高度 */}
      <div
        ref={measureRef}
        aria-hidden
        className={`${styles.messageBubble} ${styles.measure}`}
        style={{ '--bubble-scale': scale } as React.CSSProperties}
      >
        {body(true)}
      </div>
    </>
  );
};
