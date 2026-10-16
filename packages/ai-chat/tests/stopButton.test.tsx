// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageInput } from '../src/components/MessageInput';
import { MessageBubble } from '../src/components/MessageList/MessageBubble';

const stopGeneration = vi.fn();
let streaming = false;

vi.mock('../src/contexts/AiChatContext', () => ({
  useAiChat: () => ({
    state: {
      messages: [],
      models: [],
      currentModelId: 'm',
      isLoading: streaming,
      streaming,
    },
    actions: { stopGeneration, sendStreamMessage: vi.fn(), askKnowledge: vi.fn() },
  }),
}));

afterEach(() => {
  cleanup();
  stopGeneration.mockClear();
  streaming = false;
});

describe('停止生成按钮', () => {
  it('Nomi 流式生成中发送键变为停止键，点击触发 stopGeneration', () => {
    streaming = true;
    const { getByTestId, queryByLabelText } = render(<MessageInput />);
    expect(queryByLabelText('发送')).toBeNull();
    fireEvent.click(getByTestId('stop-button'));
    expect(stopGeneration).toHaveBeenCalledTimes(1);
  });

  it('空闲时仍是发送键', () => {
    const { queryByTestId, getByLabelText } = render(<MessageInput />);
    expect(queryByTestId('stop-button')).toBeNull();
    expect(getByLabelText('发送')).toBeTruthy();
  });

  it('CLI 标签（busyOverride）自带忙碌状态时不显示停止键', () => {
    streaming = true;
    const { queryByTestId } = render(<MessageInput busyOverride />);
    expect(queryByTestId('stop-button')).toBeNull();
  });

  it('被停止的消息显示灰色「已停止生成」', () => {
    const { getByTestId } = render(
      <MessageBubble
        message={{ id: 'a', role: 'assistant', content: '', timestamp: 0, stopped: true }}
      />,
    );
    expect(getByTestId('stopped-note').textContent).toBe('已停止生成');
  });
});
