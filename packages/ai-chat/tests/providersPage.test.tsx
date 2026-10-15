// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProvidersPage } from '../src/components/ProvidersPage';
import { routingStatus } from '../src/components/ProvidersPage/CliEndpointSection';
import type {
  CliProviderProfile,
  CliProviderState,
  CliRouteSettings,
} from '../src/services/cliProviderClient';

vi.mock('../src/components/lazyPanels', () => ({
  ProviderPanel: () => <div data-testid="nomi-provider-panel-stub">任务路由</div>,
}));

const prof = (o: Partial<CliProviderProfile>): CliProviderProfile => ({
  id: 'p',
  kind: 'claude',
  name: 'P',
  baseUrl: 'https://x.test/v1',
  model: 'm',
  apiFormat: 'anthropic_messages',
  needsRouting: false,
  hasKey: true,
  keyHint: '…1234',
  active: false,
  ...o,
});
const route: CliRouteSettings = {
  enabled: false,
  host: '127.0.0.1',
  port: 18721,
  claude: false,
  codex: false,
  listening: false,
  listenUrl: null,
};

function setup(profiles: CliProviderProfile[], routing: CliRouteSettings = route) {
  const calls: Array<[string, unknown[]]> = [];
  const st: CliProviderState = {
    profiles,
    claudeStore: '/ud/cli-providers/claude/store.json',
    codexStore: '/ud/cli-providers/codex/store.json',
    claudeSettings: '/home/u/.claude/settings.json',
    codexConfig: '/home/u/.codex/config.toml',
    dshStore: '/ud/cli-providers/dsh/store.json',
    dshConfig: '/home/u/.dsh/cordis.patch.yml',
    routing,
  };
  const invoke = vi.fn(async (ch: string, ...args: unknown[]) => {
    calls.push([ch, args]);
    if (ch === 'ai:cli-provider:state') return st;
    if (ch === 'ai:cli-provider:activate')
      return { ok: true, backups: [], restartRequired: false, usedRouting: false };
    if (ch === 'ai:cli-provider:deactivate') return { ok: true, backups: [] };
    if (ch === 'ai:cli-provider:test') return { ok: true, latencyMs: 123 };
    if (ch === 'ai:cli-route:set') return { ...routing, enabled: true };
    return {};
  });
  (window as unknown as { aiIPC: unknown }).aiIPC = { invoke, on: () => () => undefined };
  return calls;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  delete (window as unknown as { aiIPC?: unknown }).aiIPC;
});

describe('routingStatus（路由开关与原因）', () => {
  it('原生格式直连；非原生且未开启时提示需开启；开启后显示本机地址', () => {
    expect(routingStatus('claude', null, route).mode).toBe('none');
    expect(routingStatus('claude', prof({}), route).mode).toBe('direct');
    const need = prof({ apiFormat: 'openai_chat_completions', needsRouting: true });
    expect(routingStatus('claude', need, route).mode).toBe('blocked');
    const on = { ...route, enabled: true, claude: true, listenUrl: 'http://127.0.0.1:18721' };
    const r = routingStatus('claude', need, on);
    expect(r.mode).toBe('routed');
    expect(r.text).toContain('127.0.0.1:18721');
    expect(routingStatus('dsh', null, route).mode).toBe('n/a');
  });
});

describe('ProvidersPage', () => {
  it('Nomi 区含任务路由面板；切到 Codex 后不再出现，且各端点独立', async () => {
    setup([]);
    const r = render(<ProvidersPage />);
    expect(r.getByTestId('providers-section-nomi')).toBeTruthy();
    expect(r.getByTestId('nomi-provider-panel-stub')).toBeTruthy();
    fireEvent.click(r.getByTestId('providers-endpoint-codex'));
    await waitFor(() => expect(r.getByTestId('providers-section-codex')).toBeTruthy());
    expect(r.queryByTestId('nomi-provider-panel-stub')).toBeNull();
    expect(r.getByTestId('cli-ep-intro').textContent).toContain(
      '~/.codex/config.toml'.replace('~', '/home/u'),
    );
    expect(r.getByTestId('providers-endpoint-tabs').querySelectorAll('[role=tab]').length).toBe(4);
  });

  it('只显示该端点自己的档案，未启用时显示 CLI 自带登录', async () => {
    setup([
      prof({ id: 'c1', kind: 'claude', name: 'Claude 档案' }),
      prof({ id: 'x1', kind: 'codex', name: 'Codex 档案', apiFormat: 'openai_responses' }),
    ]);
    localStorage.setItem('ai-chat:providerEndpoint', 'claude');
    const r = render(<ProvidersPage />);
    await waitFor(() => expect(r.getByTestId('cli-provider-row-c1')).toBeTruthy());
    expect(r.queryByTestId('cli-provider-row-x1')).toBeNull();
    expect(r.getByTestId('cli-ep-active').textContent).toContain('使用 CLI 自带登录/默认配置');
    expect(r.getByTestId('cli-ep-source').textContent).toContain('CLI 自带登录');
    expect(r.queryByTestId('cli-ep-use-default')).toBeNull();
  });

  it('启用 / 测速 / 改用自带登录走各自的 IPC，状态区显示来源与路由原因', async () => {
    const calls = setup([
      prof({
        id: 'c1',
        name: '中转',
        active: true,
        apiFormat: 'openai_chat_completions',
        needsRouting: true,
      }),
      prof({ id: 'c2', name: '另一个' }),
    ]);
    localStorage.setItem('ai-chat:providerEndpoint', 'claude');
    const r = render(<ProvidersPage />);
    await waitFor(() => expect(r.getByTestId('cli-ep-active').textContent).toBe('中转'));
    expect(r.getByTestId('cli-ep-source').textContent).toContain('Nomi 档案库');
    expect(r.getByTestId('cli-ep-routing').getAttribute('data-mode')).toBe('blocked');

    const row2 = r.getByTestId('cli-provider-row-c2');
    fireEvent.click(row2.querySelector('[data-testid=cli-provider-test]')!);
    await waitFor(() => expect(row2.textContent).toContain('123 ms'));
    expect(calls.some(([c, a]) => c === 'ai:cli-provider:test' && a[0] === 'c2')).toBe(true);

    fireEvent.click(row2.querySelector('[data-testid=cli-provider-enable]')!);
    await waitFor(() =>
      expect(calls.some(([c, a]) => c === 'ai:cli-provider:activate' && a[0] === 'c2')).toBe(true),
    );
    fireEvent.click(r.getByTestId('cli-ep-use-default'));
    await waitFor(() =>
      expect(calls.some(([c, a]) => c === 'ai:cli-provider:deactivate' && a[0] === 'claude')).toBe(
        true,
      ),
    );
  });

  it('新增档案带当前端点 kind；dsh 的高级里没有路由开关', async () => {
    const calls = setup([]);
    localStorage.setItem('ai-chat:providerEndpoint', 'dsh');
    const r = render(<ProvidersPage />);
    await waitFor(() => expect(r.getByTestId('providers-section-dsh')).toBeTruthy());
    expect(r.queryByTestId('cli-route-enabled')).toBeNull();
    fireEvent.change(r.getByTestId('cli-provider-baseurl'), {
      target: { value: 'https://d.test/v1' },
    });
    fireEvent.click(r.getByTestId('cli-provider-save'));
    await waitFor(() => {
      const c = calls.find(([ch]) => ch === 'ai:cli-provider:upsert');
      expect(c).toBeTruthy();
      expect((c![1][0] as { kind: string }).kind).toBe('dsh');
    });
  });
});
