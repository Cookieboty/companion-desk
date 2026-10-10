// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageList } from '../src/components/MessageList';
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
});
