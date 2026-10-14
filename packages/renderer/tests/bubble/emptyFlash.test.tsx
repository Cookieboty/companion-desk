// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_HOLD, holdOnMessage } from '../../src/mascot/bubbleHold';

const state: { currentMessage: string | null; messageMore?: boolean } = { currentMessage: null };
vi.mock('@/contexts/MascotContext', () => ({
  useMascot: () => ({ state }),
  bubbleHover: { on: false },
}));

afterEach(cleanup);

describe('mascot bubble never flashes empty', () => {
  it('holdOnMessage keeps last text while clearing, ignores blank messages', () => {
    const shown = holdOnMessage(EMPTY_HOLD, '你好', false);
    expect(shown).toEqual({ text: '你好', more: false, active: true });
    expect(holdOnMessage(shown, '', false).text).toBe('你好');
    expect(holdOnMessage(EMPTY_HOLD, '   ', false)).toEqual(EMPTY_HOLD);
  });

  it('think bubble cleared → reply arrives: no frame renders a visible empty bubble', async () => {
    vi.useFakeTimers();
    const { MessageBubble } = await import('../../src/components/MessageBubble/MessageBubble');
    const frames: Array<{ text: string; empty: boolean; active: boolean }> = [];
    const snap = (c: HTMLElement) => {
      const el = c.querySelector('[data-testid="mascot-bubble"]') as HTMLElement;
      frames.push({
        text: el.textContent ?? '',
        empty: el.hasAttribute('data-empty'),
        active: /active/.test(el.className),
      });
    };
    state.currentMessage = '正在思考中…';
    const { container, rerender } = render(<MessageBubble />);
    snap(container);
    // 思考气泡超时被清空（AI 回复完成前的那一刻）
    state.currentMessage = null;
    rerender(<MessageBubble />);
    snap(container);
    act(() => vi.advanceTimersByTime(150));
    snap(container);
    // 回复到达
    state.currentMessage = '好啦，做完了';
    rerender(<MessageBubble />);
    snap(container);
    // 回复超时，淡出结束
    state.currentMessage = null;
    rerender(<MessageBubble />);
    snap(container);
    act(() => vi.advanceTimersByTime(400));
    snap(container);
    vi.useRealTimers();

    for (const f of frames) {
      // 任一帧：要么有文字，要么标记为 empty（visibility:hidden）
      expect(f.text.trim() !== '' || f.empty).toBe(true);
    }
    expect(frames[1].text).toBe('正在思考中…'); // 淡出期间保留旧文字
    expect(frames[1].active).toBe(false);
    expect(frames[3].text).toBe('好啦，做完了');
    expect(frames[5].empty).toBe(true);
  });
});
