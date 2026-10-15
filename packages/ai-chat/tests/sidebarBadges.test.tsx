// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../src/components/Sidebar';
import { setChatMode } from '../src/services/chatPrefs';

const list = [
  { id: 'a', name: '修复登录', backend: 'codex', createdAt: 1, updatedAt: Date.now(), tabId: 't1' },
  { id: 'b', name: '聊聊天气', backend: 'nomi', createdAt: 1, updatedAt: Date.now() - 1000 },
  { id: 'c', name: '重构模块', backend: 'claude', createdAt: 1, updatedAt: Date.now() - 2000 },
];

vi.mock('../src/contexts/AiChatContext', () => ({
  useAiChat: () => ({
    state: {
      messages: [],
      ipcClient: {
        listConversations: async () => list,
        currentConversationId: () => 'b',
        conversationStore: () => undefined,
      },
    },
    actions: {},
  }),
}));

beforeEach(() => setChatMode('dev'));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Sidebar rows', () => {
  it('shows the endpoint icon in front of the title and no text badge', async () => {
    const r = render(
      <Sidebar collapsed={false} onToggle={() => undefined} onNewChat={() => undefined} />,
    );
    await waitFor(() => expect(r.getAllByTestId('history-item')).toHaveLength(3));
    const rows = r.getAllByTestId('history-item');
    const codex = rows.find((x) => x.getAttribute('data-backend') === 'codex')!;
    const icon = codex.querySelector('[data-testid="endpoint-icon-codex"]')!;
    expect(icon.getAttribute('aria-label')).toBe('Codex');
    // 图标在标题之前（DOM 顺序）
    const title = Array.from(codex.querySelectorAll('span')).find(
      (x) => x.textContent === '修复登录',
    )!;
    expect(icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 去掉 svg（含悬停 <title>）后，行内文本只有标题 + 相对时间，没有文字徽标
    for (const row of rows) {
      const c = row.cloneNode(true) as HTMLElement;
      c.querySelectorAll('svg').forEach((n) => n.remove());
      expect(c.textContent).not.toMatch(/Codex|Nomi|Claude/);
    }
  });

  it('endpoint filter chips carry icon + plain name', async () => {
    localStorage.setItem('ai-chat:conversationListView', 'by-endpoint');
    const r = render(
      <Sidebar collapsed={false} onToggle={() => undefined} onNewChat={() => undefined} />,
    );
    await waitFor(() => r.getByTestId('endpoint-filter-claude'));
    expect(r.getByTestId('endpoint-filter-claude').textContent).toContain('Claude Code');
    expect(
      r.getByTestId('endpoint-filter-claude').querySelector('[data-testid="endpoint-icon-claude"]'),
    ).toBeTruthy();
  });
});
