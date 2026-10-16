import { describe, expect, it } from 'vitest';

import { niceMax } from '../src/components/UsagePanel/charts';
import {
  changePct,
  convert,
  dateRange,
  formatMoney,
  formatPct,
  formatPrice,
  formatTokens,
  heatLevels,
  presetRange,
  share,
} from '../src/components/UsagePanel/format';
import { parseRows } from '../src/components/UsagePanel/Pricing';

describe('用量格式化', () => {
  it('formatTokens：K / M / B 缩写，小数按量级取位', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1234)).toBe('1.23K');
    expect(formatTokens(12_345)).toBe('12.3K');
    expect(formatTokens(123_456)).toBe('123K');
    expect(formatTokens(100_000)).toBe('100K');
    expect(formatTokens(510_000)).toBe('510K');
    expect(formatTokens(1_000)).toBe('1K');
    expect(formatTokens(999_999)).toBe('1M');
    expect(formatTokens(10_000)).toBe('10K');
    expect(formatTokens(1_500_000)).toBe('1.5M');
    expect(formatTokens(2_000_000_000)).toBe('2B');
    expect(formatTokens(Number.NaN)).toBe('0');
  });

  it('formatMoney：币种符号、换算与小额显示', () => {
    expect(formatMoney(0, 'USD', 7.2)).toBe('$0.00');
    expect(formatMoney(0.004, 'USD', 7.2)).toBe('<$0.01');
    expect(formatMoney(0.5, 'USD', 7.2)).toBe('$0.500');
    expect(formatMoney(12.345, 'USD', 7.2)).toBe('$12.35');
    expect(formatMoney(1, 'CNY', 7.2)).toBe('¥7.20');
    expect(formatMoney(2000, 'USD', 7.2)).toBe('$2,000');
    expect(convert(2, 'CNY', 7)).toBe(14);
    expect(convert(2, 'USD', 7)).toBe(2);
  });

  it('formatPrice 去掉多余的 0；缺省显示 —', () => {
    expect(formatPrice(3)).toBe('3');
    expect(formatPrice(0.3)).toBe('0.3');
    expect(formatPrice(0)).toBe('0');
    expect(formatPrice(undefined)).toBe('—');
  });

  it('环比与占比', () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(10, 0)).toBeNull();
    expect(formatPct(50)).toBe('+50.0%');
    expect(formatPct(-12.34)).toBe('-12.3%');
    expect(formatPct(250)).toBe('+250%');
    expect(share(1, 4)).toBe('25%');
    expect(share(1, 1000)).toBe('<1%');
    expect(share(0, 0)).toBe('0%');
  });

  it('heatLevels：0 永远是 0 档；按分位数分 4 档，极值不会把其余压成同色', () => {
    const lv = heatLevels([0, 1, 2, 3, 4, 5, 6, 7, 8, 1_000_000]);
    expect(lv(0)).toBe(0);
    expect(lv(1)).toBe(1);
    expect(lv(1_000_000)).toBe(4);
    const mid = new Set([2, 3, 4, 5, 6, 7].map(lv));
    expect(mid.size).toBeGreaterThan(1);
    expect(heatLevels([0, 0])(5)).toBe(0);
  });

  it('niceMax 取整到 1 / 2 / 2.5 / 5 / 10 × 10^n', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(0.021)).toBeCloseTo(0.025);
    expect(niceMax(900_000)).toBe(1_000_000);
  });

  it('presetRange / dateRange：按本地自然日', () => {
    const now = new Date(2026, 9, 16, 15, 30).getTime();
    const today = presetRange('today', now);
    expect(today.from).toBe(new Date(2026, 9, 16).getTime());
    expect(today.to).toBe(new Date(2026, 9, 17).getTime());
    expect(presetRange('7d', now).from).toBe(new Date(2026, 9, 10).getTime());
    expect(dateRange('2026-10-16')).toEqual({
      from: new Date(2026, 9, 16).getTime(),
      to: new Date(2026, 9, 17).getTime(),
    });
  });

  it('parseRows：必填 / 重复 / 非法数字都会报错，缓存价可留空，0 合法', () => {
    const ok = parseRows([
      { model: ' my-model ', input: '0', output: '2.5', cacheRead: '', cacheWrite: '0.1' },
    ]);
    expect(ok).toEqual({
      prices: [{ model: 'my-model', input: 0, output: 2.5, cacheWrite: 0.1 }],
    });
    expect(
      'error' in parseRows([{ model: '', input: '1', output: '1', cacheRead: '', cacheWrite: '' }]),
    ).toBe(true);
    expect(
      'error' in parseRows([{ model: 'a', input: '', output: '1', cacheRead: '', cacheWrite: '' }]),
    ).toBe(true);
    expect(
      'error' in
        parseRows([{ model: 'a', input: '-1', output: '1', cacheRead: '', cacheWrite: '' }]),
    ).toBe(true);
    expect(
      'error' in
        parseRows([
          { model: 'A', input: '1', output: '1', cacheRead: '', cacheWrite: '' },
          { model: 'a', input: '1', output: '1', cacheRead: '', cacheWrite: '' },
        ]),
    ).toBe(true);
  });
});
