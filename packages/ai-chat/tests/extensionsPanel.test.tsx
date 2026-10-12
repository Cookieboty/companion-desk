// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExtensionsPanel } from '../src/components/ExtensionsPanel';
import { parseKv, splitArgs } from '../src/services/extClient';

afterEach(() => {
  cleanup();
  delete (window as { aiIPC?: unknown }).aiIPC;
});

const presets = [
  {
    key: 'memory',
    name: '知识图谱记忆',
    description: 'd',
    server: { transport: 'stdio', command: 'npx', args: ['-y', 'm'] },
    license: 'MIT',
  },
];

function mockIpc(servers: unknown[] = []) {
  const invoke = vi.fn(async (ch: string, ..._a: unknown[]) => {
    if (ch === 'ai:ext:mcp-list') return { servers, env: [], presets, ready: true };
    if (ch === 'ai:ext:skills-list')
      return [
        {
          name: 'weekly-report',
          description: '写周报',
          enabled: true,
          builtin: true,
          files: [],
          dir: 'weekly-report',
        },
      ];
    if (ch === 'ai:ext:mcp-upsert') return { id: 'mcp', ...(_a[0] as object) };
    return true;
  });
  (window as unknown as { aiIPC: unknown }).aiIPC = { invoke, on: () => () => undefined };
  return invoke;
}

describe('ExtensionsPanel', () => {
  it('shows presets when empty and saves a server from a preset', async () => {
    const invoke = mockIpc();
    const r = render(<ExtensionsPanel isVisible onClose={() => undefined} />);
    await waitFor(() => expect(r.getByText('还没有 MCP 服务器')).toBeTruthy());
    fireEvent.click(r.getByTestId('mcp-preset-memory'));
    await waitFor(() =>
      expect((r.getByTestId('mcp-command') as HTMLInputElement).value).toBe('npx'),
    );
    fireEvent.click(r.getByTestId('mcp-save'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'ai:ext:mcp-upsert',
        expect.objectContaining({
          name: '知识图谱记忆',
          command: 'npx',
          args: ['-y', 'm'],
          trust: 'ask',
        }),
      ),
    );
  });
  it('lists connected server tools and skills', async () => {
    mockIpc([
      {
        id: 'w',
        name: '天气',
        transport: 'stdio',
        command: 'node',
        args: ['w.mjs'],
        enabled: true,
        trust: 'ask',
        origin: 'user',
        status: 'connected',
        tools: [
          { name: 'w__get_weather', description: '查天气', readOnly: true, dangerous: false },
        ],
      },
    ]);
    const r = render(<ExtensionsPanel isVisible onClose={() => undefined} />);
    await waitFor(() => expect(r.getByText('已连接')).toBeTruthy());
    expect(r.getByText('已向模型提供 1 个扩展工具')).toBeTruthy();
    fireEvent.click(r.getAllByRole('tab')[1]);
    await waitFor(() => expect(r.getByText('weekly-report')).toBeTruthy());
    expect(r.getByText('内置示例')).toBeTruthy();
  });
  it('helpers', () => {
    expect(splitArgs('-y "a b" c')).toEqual(['-y', 'a b', 'c']);
    expect(parseKv('A=1\nbad\nB = x=y')).toEqual({ A: '1', B: 'x=y' });
  });
});
