// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatTabs } from '../src/components/ChatTabs';
import { EndpointControls } from '../src/components/EndpointControls';
import { WorkspacePicker } from '../src/components/WorkspacePicker';
import { HarnessTabsProvider } from '../src/contexts/HarnessTabsContext';
import { setChatMode } from '../src/services/chatPrefs';
import type { HarnessTabMeta, HarnessTabsState } from '../src/services/harnessClient';
import { shortenPath } from '../src/utils/workspacePath';

vi.mock('../src/contexts/AiChatContext', () => ({
  useAiChat: () => ({
    state: { messages: [] },
    actions: { newConversation: async () => undefined },
  }),
}));

const tab = (over: Partial<HarnessTabMeta>): HarnessTabMeta => ({
  id: 'x',
  title: 'X',
  backend: 'codex',
  cwd: '/Users/me/projects/very/long/path/to/my-awesome-repo',
  cliSessionId: null,
  status: 'idle',
  unread: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

function mockIpc(tabs: HarnessTabsState, picked: string | null = '/picked/dir') {
  const invoke = vi.fn(async (ch: string) => {
    if (ch === 'ai:harness:tabs') return tabs;
    if (ch === 'ai:harness:state')
      return { backend: 'nomi', cwd: '/w', bins: { claude: '/c', codex: '/x', dsh: '/d' } };
    if (ch === 'ai:providers:state')
      return { providers: [], envProviders: [], routes: {}, roles: [], encryption: 'none' };
    if (ch === 'ai:harness:recent-cwds') return ['/recent/one', '/recent/two'];
    if (ch === 'ai:harness:pick-dir') return picked;
    if (ch === 'ai:cli-provider:state')
      return {
        profiles: [],
        claudeStore: '',
        codexStore: '',
        claudeSettings: '',
        codexConfig: '',
        routing: null,
      };
    if (ch === 'ai:harness:tab-messages') return [];
    return {};
  });
  (window as unknown as { aiIPC: unknown }).aiIPC = { invoke, on: () => () => undefined };
  return invoke;
}
const state = (cli: Partial<HarnessTabMeta> = {}): HarnessTabsState => ({
  tabs: [tab({ id: 'main', backend: 'nomi', cwd: '/docs' }), tab({ id: 'cx', ...cli })],
  activeTabId: 'cx',
  maxConcurrent: 3,
  running: 0,
  queued: 0,
});

function stubConfirm(v: boolean) {
  const fn = vi.fn(() => v);
  (window as unknown as { confirm: unknown }).confirm = fn;
  return fn;
}

beforeEach(() => setChatMode('dev'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete (window as { aiIPC?: unknown }).aiIPC;
});

describe('shortenPath', () => {
  it('replaces the home dir and keeps the last segments', () => {
    expect(shortenPath('/Users/me/code/app')).toBe('~/code/app');
    expect(shortenPath('/Users/me/projects/very/long/path/to/my-awesome-repo')).toBe(
      '…/to/my-awesome-repo',
    );
    expect(shortenPath('/')).toBe('/');
  });
});

describe('WorkspacePicker', () => {
  it('shows the short path with the full path as tooltip; recent + native picker', async () => {
    const invoke = mockIpc(state());
    const onChange = vi.fn();
    const r = render(<WorkspacePicker value="/Users/me/code/app" onChange={onChange} />);
    const btn = r.getByTestId('workspace-picker-button');
    expect(r.getByTestId('workspace-picker-path').textContent).toBe('~/code/app');
    expect(btn.getAttribute('title')).toContain('/Users/me/code/app');
    fireEvent.click(btn);
    await waitFor(() => expect(r.getAllByTestId('workspace-recent-item')).toHaveLength(2));
    fireEvent.click(r.getAllByTestId('workspace-recent-item')[0]!);
    expect(onChange).toHaveBeenCalledWith('/recent/one');
    fireEvent.click(btn);
    fireEvent.click(r.getByTestId('workspace-browse'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/picked/dir'));
    expect(invoke).toHaveBeenCalledWith('ai:harness:pick-dir', '/Users/me/code/app');
  });
});

describe('EndpointControls workspace for CLI tabs', () => {
  const mount = () =>
    render(
      <HarnessTabsProvider>
        <EndpointControls onManageNomi={() => undefined} onManageCli={() => undefined} />
      </HarnessTabsProvider>,
    );

  it('is shown for a CLI tab, with the tab cwd', async () => {
    mockIpc(state());
    const r = mount();
    await waitFor(() => r.getByTestId('cli-workspace'));
    expect(r.getByTestId('cli-workspace-button').getAttribute('title')).toContain(
      '/Users/me/projects/very/long/path/to/my-awesome-repo',
    );
  });

  it('is not shown for the Nomi main tab', async () => {
    mockIpc({ ...state(), activeTabId: 'main' });
    const r = mount();
    await waitFor(() => r.getByTestId('backend-switcher'));
    expect(r.queryByTestId('cli-workspace')).toBeNull();
  });

  it('changing cwd on a session asks for confirmation and aborts when declined', async () => {
    const invoke = mockIpc(state({ cliSessionId: 'sess-1' }));
    const confirm = stubConfirm(false);
    const r = mount();
    await waitFor(() => r.getByTestId('cli-workspace'));
    fireEvent.click(r.getByTestId('cli-workspace-button'));
    await waitFor(() => r.getAllByTestId('workspace-recent-item'));
    fireEvent.click(r.getAllByTestId('workspace-recent-item')[0]!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(String((confirm.mock.calls[0] as unknown[])[0])).toContain('新的 CLI 会话');
    expect(invoke).not.toHaveBeenCalledWith('ai:harness:tab-cwd', 'cx', '/recent/one');

    confirm.mockImplementation(() => true);
    fireEvent.click(r.getByTestId('cli-workspace-button'));
    await waitFor(() => r.getAllByTestId('workspace-recent-item'));
    fireEvent.click(r.getAllByTestId('workspace-recent-item')[0]!);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('ai:harness:tab-cwd', 'cx', '/recent/one'),
    );
  });

  it('no confirmation for a fresh tab without a session', async () => {
    const invoke = mockIpc(state());
    const confirm = stubConfirm(false);
    const r = mount();
    await waitFor(() => r.getByTestId('cli-workspace'));
    fireEvent.click(r.getByTestId('cli-workspace-button'));
    await waitFor(() => r.getAllByTestId('workspace-recent-item'));
    fireEvent.click(r.getAllByTestId('workspace-recent-item')[1]!);
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('ai:harness:tab-cwd', 'cx', '/recent/two'),
    );
  });
});

describe('new tab menu workspace', () => {
  it('creates the tab in the chosen workspace', async () => {
    const invoke = mockIpc(state());
    const r = render(
      <HarnessTabsProvider>
        <ChatTabs />
      </HarnessTabsProvider>,
    );
    await waitFor(() => r.getByTestId('chat-tab-add'));
    fireEvent.click(r.getByTestId('chat-tab-add'));
    fireEvent.click(r.getByTestId('new-tab-workspace-button'));
    await waitFor(() => r.getAllByTestId('workspace-recent-item'));
    fireEvent.click(r.getAllByTestId('workspace-recent-item')[0]!);
    fireEvent.click(r.getByTestId('chat-tab-new-claude'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('ai:harness:tab-create', {
        backend: 'claude',
        cwd: '/recent/one',
      }),
    );
  });
});
