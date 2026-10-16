// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsagePanel } from '../src/components/UsagePanel';

const summary = (over = {}) => ({
  costUsd: 12.5,
  input: 2_000_000,
  output: 300_000,
  total: 2_300_000,
  cacheRead: 500_000,
  cacheWrite: 10_000,
  calls: 42,
  estimatedCalls: 3,
  unpriced: [{ model: 'mystery-1', tokens: 1000, calls: 2 }],
  ...over,
});

const NOW = Date.now();
const series = Array.from({ length: 7 }, (_, i) => ({
  t: NOW - (6 - i) * 86_400_000,
  input: 100 * (i + 1),
  output: 50 * (i + 1),
  tokens: 150 * (i + 1),
  costUsd: 0.1 * (i + 1),
  calls: i + 1,
}));

const QUERY = {
  range: { id: '7d', from: NOW - 6 * 86_400_000, to: NOW, bucket: 'day' },
  summary: summary(),
  prev: summary({ costUsd: 5, total: 1_000_000, input: 900_000, output: 100_000 }),
  series,
  bySource: [
    {
      key: 'claude',
      tokens: 1_500_000,
      input: 1_300_000,
      output: 200_000,
      costUsd: 9,
      calls: 20,
      hasUnpriced: false,
    },
    {
      key: 'nomi',
      tokens: 800_000,
      input: 700_000,
      output: 100_000,
      costUsd: 3.5,
      calls: 22,
      hasUnpriced: true,
    },
  ],
  byProvider: [
    {
      key: 'Anthropic',
      tokens: 1_500_000,
      input: 1,
      output: 1,
      costUsd: 9,
      calls: 20,
      hasUnpriced: false,
    },
  ],
  byModel: [
    {
      key: 'claude-sonnet-4-5',
      tokens: 1_500_000,
      input: 1,
      output: 1,
      costUsd: 9,
      calls: 20,
      hasUnpriced: false,
    },
    {
      key: 'mystery-1',
      tokens: 800_000,
      input: 1,
      output: 1,
      costUsd: 0,
      calls: 22,
      hasUnpriced: true,
    },
  ],
};

const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const HEAT = Array.from({ length: 365 }, (_, i) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (364 - i));
  return {
    date: dayKey(d),
    tokens: i % 5 === 0 ? i * 100 : 0,
    costUsd: i % 5 === 0 ? i * 0.01 : 0,
    calls: i % 5 === 0 ? 3 : 0,
  };
});

const STATE = {
  settings: {
    enabled: true,
    readToolLogs: true,
    retention: '1y',
    currency: 'USD',
    cnyPerUsd: 7.2,
    customPrices: [],
    clearedAt: 0,
  },
  detected: ['claude', 'codex'],
  records: 42,
  lastScanAt: NOW,
  pricing: {
    date: '2026-10-16',
    builtin: [
      {
        model: 'claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
      },
    ],
  },
};

const ROWS = {
  rows: [
    {
      key: 'a',
      ts: NOW,
      source: 'claude',
      provider: 'Anthropic',
      model: 'claude-sonnet-4-5',
      session: 's1',
      project: 'proj',
      input: 10,
      output: 5,
      cacheRead: 1,
      cacheWrite: 2,
      tokens: 15,
      costUsd: 0.5,
      estimated: false,
    },
    {
      key: 'b',
      ts: NOW - 1000,
      source: 'nomi',
      provider: 'X',
      model: 'mystery-1',
      input: 1000,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      tokens: 1050,
      costUsd: null,
      estimated: true,
    },
  ],
  total: 2,
  summary: summary(),
  facets: {
    sources: ['claude', 'nomi'],
    models: ['claude-sonnet-4-5', 'mystery-1'],
    sessions: [{ id: 's1', label: 'proj · s1' }],
  },
};

let calls: Array<[string, ...unknown[]]>;
let state: typeof STATE;
let emptyData = false;

function install() {
  calls = [];
  state = JSON.parse(JSON.stringify(STATE));
  (window as unknown as { aiIPC: unknown }).aiIPC = {
    invoke: vi.fn(async (ch: string, ...a: unknown[]) => {
      calls.push([ch, ...a]);
      switch (ch) {
        case 'ai:usage:state':
          return emptyData ? { ...state, records: 0 } : state;
        case 'ai:usage:query':
          return emptyData
            ? {
                ...QUERY,
                summary: summary({ calls: 0, unpriced: [], estimatedCalls: 0 }),
                series: [],
              }
            : { ...QUERY, range: { ...QUERY.range, id: a[0] } };
        case 'ai:usage:heatmap':
          return { days: HEAT, today: dayKey(today) };
        case 'ai:usage:details':
          return ROWS;
        case 'ai:usage:csv':
          return 'a,b\n1,2\n';
        case 'ai:usage:set-settings':
          state = { ...state, settings: { ...state.settings, ...(a[0] as object) } };
          return state.settings;
        case 'ai:usage:scan':
          return { ...state, added: 0, files: 0 };
      }
      return null;
    }),
    on: vi.fn(() => () => undefined),
  };
}

beforeEach(() => {
  emptyData = false;
  install();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { aiIPC?: unknown }).aiIPC;
});

const queries = () => calls.filter((c) => c[0] === 'ai:usage:query').map((c) => c[1]);

describe('UsagePanel 概览', () => {
  it('四张摘要卡片 + 未定价提示 + 估算提示 + 趋势 / 分布 / 排行 / 热力图', async () => {
    const { findByTestId, getByTestId } = render(<UsagePanel />);
    const cost = await findByTestId('usage-card-cost');
    expect(cost.textContent).toContain('$12.50');
    expect(cost.textContent).toContain('+150%');
    expect(getByTestId('usage-card-total').textContent).toContain('2.3M');
    expect(getByTestId('usage-card-input').textContent).toContain('2M');
    expect(getByTestId('usage-card-input').textContent).toContain('510K');
    expect(getByTestId('usage-card-output').textContent).toContain('300K');
    expect(getByTestId('usage-unpriced-notice').textContent).toContain('mystery-1');
    expect(getByTestId('usage-estimated-notice').textContent).toContain('3');
    expect(getByTestId('usage-trend')).toBeTruthy();
    expect(getByTestId('usage-breakdown-source').textContent).toContain('Claude Code');
    expect(getByTestId('usage-breakdown-model').textContent).toContain('mystery-1');
    // 未定价模型显示「未定价」而不是 0
    expect(within(getByTestId('usage-breakdown-model')).getByTestId('usage-unpriced')).toBeTruthy();
    expect(
      getByTestId('usage-heatmap').querySelectorAll('[data-testid="usage-heat-cell"]'),
    ).toHaveLength(365);
  });

  it('切换时间范围会重新查询；切到 CNY 写设置并按汇率换算', async () => {
    const { findByTestId, getByRole, getAllByRole } = render(<UsagePanel />);
    await findByTestId('usage-card-cost');
    expect(queries()).toEqual(['7d']);
    fireEvent.click(getByRole('tab', { name: '30 天' }));
    await waitFor(() => expect(queries()).toContain('30d'));
    // 顶部币种切换
    const cny = getAllByRole('tab', { name: 'CNY' })[0]!;
    fireEvent.click(cny);
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c[0] === 'ai:usage:set-settings' && (c[1] as { currency?: string }).currency === 'CNY',
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        (document.querySelector('[data-testid="usage-card-cost"]') as HTMLElement).textContent,
      ).toContain('¥90.00'),
    );
  });

  it('没有任何数据：复用 EmptyState，并可手动扫描', async () => {
    emptyData = true;
    install();
    const { findByTestId, getByText } = render(<UsagePanel />);
    const e = await findByTestId('usage-empty');
    expect(e.className).toContain('cd-empty');
    fireEvent.click(getByText('立即扫描本机日志'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'ai:usage:scan')).toBe(true));
  });

  it('不在桌面环境：显示占位而不是报错', () => {
    delete (window as unknown as { aiIPC?: unknown }).aiIPC;
    const { getByText } = render(<UsagePanel />);
    expect(getByText('用量统计仅在桌面应用中提供')).toBeTruthy();
  });

  it('点热力图某一天：显示当日汇总，「查看当日明细」跳到明细并按当天过滤', async () => {
    const { findByTestId, getAllByTestId, getByTestId } = render(<UsagePanel />);
    await findByTestId('usage-heatmap');
    const cell = getAllByTestId('usage-heat-cell').find((c) =>
      /(?<!\d)[1-9]\d* tokens/.test(c.getAttribute('aria-label') ?? ''),
    )!;
    const date = cell.getAttribute('data-date')!;
    fireEvent.click(cell);
    expect(getByTestId('usage-day').textContent).toContain(date);
    fireEvent.click(getByTestId('usage-day-details'));
    await findByTestId('usage-details');
    await waitFor(() => {
      const q = calls.filter((c) => c[0] === 'ai:usage:details').at(-1)![1] as {
        from: number;
        to: number;
      };
      const [y, m, d] = date.split('-').map(Number) as [number, number, number];
      expect(q.from).toBe(new Date(y, m - 1, d).getTime());
      expect(q.to).toBe(new Date(y, m - 1, d + 1).getTime());
    });
  });
});

describe('UsagePanel 明细 / 价格', () => {
  it('明细：未定价与估算标记、排序、筛选、CSV 导出', async () => {
    const created: Blob[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => {
      created.push(b);
      return 'blob:x';
    };
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    const { findByTestId, getByRole, getAllByTestId, getByTestId } = render(<UsagePanel />);
    await findByTestId('usage-card-cost');
    fireEvent.click(getByRole('tab', { name: '明细' }));
    await findByTestId('usage-details');
    await waitFor(() => expect(getAllByTestId('usage-row')).toHaveLength(2));
    const rows = getAllByTestId('usage-row');
    expect(rows[1]!.textContent).toContain('未定价');
    expect(rows[1]!.textContent).toContain('估算');
    expect(rows[0]!.textContent).toContain('$0.500');

    fireEvent.click(getByTestId('usage-sort-cost'));
    await waitFor(() => {
      const q = calls.filter((c) => c[0] === 'ai:usage:details').at(-1)![1] as {
        sort: string;
        dir: string;
      };
      expect(q.sort).toBe('cost');
      expect(q.dir).toBe('desc');
    });
    fireEvent.click(getByTestId('usage-sort-cost'));
    await waitFor(() => {
      const q = calls.filter((c) => c[0] === 'ai:usage:details').at(-1)![1] as { dir: string };
      expect(q.dir).toBe('asc');
    });

    fireEvent.click(getByTestId('usage-export'));
    await waitFor(() => expect(created).toHaveLength(1));
    const bytes = new Uint8Array(await new Response(created[0]).arrayBuffer());
    // UTF-8 BOM：Excel 直接打开不乱码
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csvCall = calls.find((c) => c[0] === 'ai:usage:csv')![1] as {
      limit: number;
      sort: string;
    };
    expect(csvCall.limit).toBeGreaterThan(1000);
  });

  it('价格：展示内置价格表；为未定价模型一键加行并保存', async () => {
    const { findByTestId, getByRole, getByTestId, getByText } = render(<UsagePanel />);
    await findByTestId('usage-card-cost');
    fireEvent.click(getByRole('tab', { name: '价格' }));
    await findByTestId('usage-pricing');
    expect(getByTestId('usage-builtin-table').textContent).toContain('Claude Sonnet 4.5');
    expect(getByTestId('usage-builtin-table').textContent).toContain('3.75');
    // 未定价模型提示：点一下加成一行
    fireEvent.click(within(getByTestId('usage-todo-prices')).getByText('mystery-1'));
    const row = getByTestId('usage-custom-row');
    fireEvent.change(within(row).getByTestId('usage-price-input'), { target: { value: '1.5' } });
    fireEvent.change(within(row).getByTestId('usage-price-output'), { target: { value: '0' } });
    fireEvent.click(getByTestId('usage-save-prices'));
    await waitFor(() => {
      const c = calls.find(
        (x) =>
          x[0] === 'ai:usage:set-settings' && (x[1] as { customPrices?: unknown }).customPrices,
      );
      expect((c![1] as { customPrices: unknown }).customPrices).toEqual([
        { model: 'mystery-1', input: 1.5, output: 0 },
      ]);
    });
    await waitFor(() => expect(getByText('已保存')).toBeTruthy());
  });

  it('价格：缺少输入 / 输出价时拒绝保存并提示', async () => {
    const { findByTestId, getByRole, getByTestId, findByText } = render(<UsagePanel />);
    await findByTestId('usage-card-cost');
    fireEvent.click(getByRole('tab', { name: '价格' }));
    await findByTestId('usage-pricing');
    fireEvent.click(getByTestId('usage-add-price'));
    fireEvent.change(within(getByTestId('usage-custom-row')).getByPlaceholderText('model-name'), {
      target: { value: 'foo' },
    });
    fireEvent.click(getByTestId('usage-save-prices'));
    expect(await findByText(/价格需要是不小于 0 的数字/)).toBeTruthy();
    expect(
      calls.some(
        (c) =>
          c[0] === 'ai:usage:set-settings' && (c[1] as { customPrices?: unknown }).customPrices,
      ),
    ).toBe(false);
  });
});
