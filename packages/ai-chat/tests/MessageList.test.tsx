// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { isNearBottom, MessageList, messageRowKey } from '../src/components/MessageList';
import type { ChatMessage } from '../src/types/chat';

const makeMessages = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message ${i}`,
    timestamp: 0,
  }));

afterEach(cleanup);

describe('MessageList', () => {
  it('renders every message when below the virtualization threshold', () => {
    const { getByText, queryAllByRole } = render(<MessageList messages={makeMessages(3)} />);
    expect(getByText('message 2')).toBeTruthy();
    expect(queryAllByRole('listitem')).toHaveLength(0);
  });

  it('virtualizes long conversations with react-window 2 (rows only for the window)', () => {
    const { container } = render(<MessageList messages={makeMessages(200)} />);
    const rows = container.querySelectorAll('[role="listitem"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(200);
    expect(rows[0]?.getAttribute('aria-setsize')).toBe('200');
    expect(container.textContent).toMatch(/message \d+/);
  });

  it('never renders an empty assistant placeholder bubble (stream start / empty finish)', () => {
    const msgs: ChatMessage[] = [
      { id: 'u', role: 'user', content: '你好', timestamp: 0 },
      { id: 'a', role: 'assistant', content: '', timestamp: 0 },
    ];
    const { container, rerender } = render(<MessageList messages={msgs} isLoading />);
    expect(container.textContent).toContain('你好');
    // 只有用户这一条气泡 + 「正在思考」指示
    expect(container.textContent).not.toContain('AI助手');
    rerender(<MessageList messages={[msgs[0], { ...msgs[1], content: '   ' }]} />);
    expect(container.textContent).not.toContain('AI助手');
    rerender(<MessageList messages={[msgs[0], { ...msgs[1], content: '在的' }]} />);
    expect(container.textContent).toContain('在的');
    expect(container.textContent).toContain('AI助手');
  });
});

describe('MessageList 虚拟列表 key / 贴底判定', () => {
  it('行 key 取消息 id，而不是下标', () => {
    const messages = makeMessages(3);
    expect(messageRowKey(1, { messages })).toBe('m1');
    expect(messageRowKey(9, { messages })).toBe('9'); // 越界时兜底
  });

  it('isNearBottom：阈值内视为贴底', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 400 })).toBe(false);
  });

  it('长对话超过阈值后仍按动态行高渲染（行没有写死 120px 高度）', () => {
    const { container } = render(<MessageList messages={makeMessages(80)} />);
    const rows = container.querySelectorAll<HTMLElement>('[role="listitem"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.style.height).not.toBe('120px');
  });
});

describe('MessageList 自动跟随（贴底才跟，上滚不抢）', () => {
  const proto = HTMLElement.prototype;
  const saved = {
    sh: Object.getOwnPropertyDescriptor(proto, 'scrollHeight'),
    ch: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
  };
  afterEach(() => {
    if (saved.sh) Object.defineProperty(proto, 'scrollHeight', saved.sh);
    else delete (proto as unknown as Record<string, unknown>).scrollHeight;
    if (saved.ch) Object.defineProperty(proto, 'clientHeight', saved.ch);
    else delete (proto as unknown as Record<string, unknown>).clientHeight;
  });
  const mockLayout = () => {
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 1000 });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 400 });
  };
  const scroller = (c: HTMLElement) =>
    c.querySelector<HTMLElement>('[class*="messageListSimple"]')!;

  it('首次渲染贴底；用户上滚后流式增长不再强制贴底；自己发消息或回到底部后恢复跟随', () => {
    mockLayout();
    const base = makeMessages(4);
    const { container, rerender } = render(<MessageList messages={base} />);
    const el = scroller(container);
    expect(el.scrollTop).toBe(1000);

    // 用户上滚阅读
    el.scrollTop = 100;
    fireEvent.scroll(el);
    const grown = base.map((m, i) => (i === 3 ? { ...m, content: m.content + ' more text' } : m));
    rerender(<MessageList messages={grown} />);
    expect(el.scrollTop).toBe(100);

    // 自己发了一条新消息 → 贴底
    rerender(
      <MessageList
        messages={[...grown, { id: 'u-new', role: 'user', content: 'hi', timestamp: 0 }]}
      />,
    );
    expect(el.scrollTop).toBe(1000);

    // 回到底部附近后，流式增长继续跟随
    el.scrollTop = 580;
    fireEvent.scroll(el);
    el.scrollTop = 580;
    const withReply = [
      ...grown,
      { id: 'u-new', role: 'user' as const, content: 'hi', timestamp: 0 },
      { id: 'a-new', role: 'assistant' as const, content: 'x', timestamp: 0 },
    ];
    rerender(<MessageList messages={withReply} />);
    expect(el.scrollTop).toBe(1000);
  });
});
