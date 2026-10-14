// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatTabs, tabDotStatus } from '../src/components/ChatTabs';
import { HarnessTabsProvider } from '../src/contexts/HarnessTabsContext';
import type { HarnessTabMeta, HarnessTabsState } from '../src/services/harnessClient';

afterEach(() => {
  cleanup();
  delete (window as { aiIPC?: unknown }).aiIPC;
});

const tab = (over: Partial<HarnessTabMeta>): HarnessTabMeta => ({
  id: 'x',
  title: 'X',
  backend: 'claude',
  cwd: '/w',
  cliSessionId: null,
  status: 'idle',
  unread: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

function mockIpc(initial: HarnessTabsState) {
  let state = initial;
  const listeners: Record<string, Array<(p: unknown) => void>> = {};
  const invoke = vi.fn(async (ch: string, ...a: unknown[]) => {
    if (ch === 'ai:harness:tabs') return state;
    if (ch === 'ai:harness:state') return { bins: { claude: '/c', codex: '/x', dsh: null } };
    if (ch === 'ai:harness:tab-activate') {
      state = { ...state, activeTabId: String(a[0]) };
      listeners['ai:harness:tabs']?.forEach((f) => f(state));
      return state;
    }
    if (ch === 'ai:harness:tab-create') {
      const t = tab({ id: 'new', title: 'Codex', backend: 'codex' });
      state = { ...state, tabs: [...state.tabs, t], activeTabId: 'new' };
      listeners['ai:harness:tabs']?.forEach((f) => f(state));
      return t;
    }
    if (ch === 'ai:harness:tab-messages') return [];
    return state;
  });
  const on = (ch: string, fn: (p: unknown) => void) => {
    (listeners[ch] ??= []).push(fn);
    return () => undefined;
  };
  (window as unknown as { aiIPC: unknown }).aiIPC = { invoke, on };
  return {
    invoke,
    push: (s: HarnessTabsState) => {
      state = s;
      listeners['ai:harness:tabs']?.forEach((f) => f(s));
    },
  };
}

const base = (): HarnessTabsState => ({
  tabs: [
    tab({ id: 'main', title: 'Chat', backend: 'nomi' }),
    tab({ id: 'a', title: 'Claude Code', status: 'running' }),
    tab({ id: 'b', title: 'dsh', backend: 'dsh', unread: 2 }),
  ],
  activeTabId: 'main',
  maxConcurrent: 3,
  running: 1,
  queued: 0,
});

describe('tabDotStatus', () => {
  it('maps status, unread and main loading', () => {
    expect(tabDotStatus(tab({}))).toBe('idle');
    expect(tabDotStatus(tab({ unread: 1 }))).toBe('unread');
    expect(tabDotStatus(tab({ status: 'queued', unread: 1 }))).toBe('queued');
    expect(tabDotStatus(tab({ id: 'main' }), true)).toBe('running');
  });
});

describe('ChatTabs', () => {
  it('renders status dots, unread badges and the load counter', async () => {
    mockIpc(base());
    const r = render(
      <HarnessTabsProvider>
        <ChatTabs />
      </HarnessTabsProvider>,
    );
    await waitFor(() => expect(r.getByTestId('chat-tab-2')).toBeTruthy());
    expect(r.getByTestId('chat-tab-1').getAttribute('data-status')).toBe('running');
    expect(r.getByTestId('chat-tab-2').getAttribute('data-status')).toBe('unread');
    expect(r.getByTestId('chat-tab-unread').textContent).toBe('2');
    expect(r.getByTestId('chat-tabs-load').textContent).toContain('1/3');
    // main 标签没有关闭按钮
    expect(r.queryByTestId('chat-tab-close-0')).toBeNull();
  });

  it('activates, renames and creates tabs', async () => {
    const ipc = mockIpc(base());
    const r = render(
      <HarnessTabsProvider>
        <ChatTabs />
      </HarnessTabsProvider>,
    );
    await waitFor(() => r.getByTestId('chat-tab-2'));
    fireEvent.click(r.getByTestId('chat-tab-2'));
    await waitFor(() =>
      expect(r.getByTestId('chat-tab-2').getAttribute('aria-selected')).toBe('true'),
    );
    expect(ipc.invoke).toHaveBeenCalledWith('ai:harness:tab-activate', 'b');

    fireEvent.doubleClick(r.getByTestId('chat-tab-1'));
    const input = r.getByTestId('chat-tab-rename') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Backend refactor' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ipc.invoke).toHaveBeenCalledWith('ai:harness:tab-rename', 'a', 'Backend refactor');

    fireEvent.click(r.getByTestId('chat-tab-add'));
    await waitFor(() =>
      expect((r.getByTestId('chat-tab-new-dsh') as HTMLButtonElement).disabled).toBe(true),
    );
    fireEvent.click(r.getByTestId('chat-tab-new-codex'));
    await waitFor(() => expect(r.getByTestId('chat-tab-3')).toBeTruthy());
    expect(ipc.invoke).toHaveBeenCalledWith('ai:harness:tab-create', { backend: 'codex' });
  });

  it('cycles tabs with arrow keys', async () => {
    const ipc = mockIpc(base());
    const r = render(
      <HarnessTabsProvider>
        <ChatTabs />
      </HarnessTabsProvider>,
    );
    await waitFor(() => r.getByTestId('chat-tab-0'));
    act(() => {
      fireEvent.keyDown(r.getByRole('tablist'), { key: 'ArrowLeft' });
    });
    expect(ipc.invoke).toHaveBeenCalledWith('ai:harness:tab-activate', 'b');
  });
});
