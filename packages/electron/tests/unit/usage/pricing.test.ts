import {
  BUILTIN_PRICES,
  costUsd,
  findPrice,
  normalizeModel,
  sanitizeCustomPrices,
} from '../../../src/usage/pricing';

describe('模型名规范化与价格匹配', () => {
  it('去前缀 / 后缀标记，点号版本统一为连字符', () => {
    expect(normalizeModel('Anthropic/Claude-Opus-4.5')).toBe('claude-opus-4-5');
    expect(normalizeModel('claude-sonnet-4-5[1m]')).toBe('claude-sonnet-4-5');
    expect(normalizeModel('openai/gpt-5.1')).toBe('gpt-5-1');
    expect(normalizeModel('')).toBe('');
  });

  it('内置表：精确 / 日期后缀 / 最长前缀', () => {
    expect(findPrice('gpt-4o')?.price).toMatchObject({ input: 2.5, output: 10 });
    expect(findPrice('gpt-4o-mini-2024-07-18')?.matched).toBe('gpt-4o-mini');
    expect(findPrice('gpt-4o-2024-08-06')?.matched).toBe('gpt-4o');
    // 特殊日期版本单独定价，不能被 gpt-4o 前缀吞掉
    expect(findPrice('gpt-4o-2024-05-13')?.price).toMatchObject({ input: 5, output: 15 });
    expect(findPrice('claude-sonnet-4-5-20250929')?.matched).toBe('claude-sonnet-4-5');
    expect(findPrice('claude-3-5-haiku-20241022')?.price.input).toBe(0.8);
    expect(findPrice('anthropic/claude-opus-4.5')?.price).toMatchObject({
      input: 5,
      output: 25,
      cacheRead: 0.5,
      cacheWrite: 6.25,
    });
  });

  it('不确定的模型不编造：未知模型 / 未收录的变体 = 未定价', () => {
    expect(findPrice('qwen2.5:0.5b')).toBeNull();
    expect(findPrice('deepseek-chat')).toBeNull();
    expect(findPrice('gpt-5-codex')).toBeNull();
    expect(findPrice('claude-opus-4-9')).toBeNull();
    expect(findPrice('gpt-5-pro')).toBeNull();
    expect(findPrice('o1-pro')).toBeNull();
    expect(findPrice('unknown')).toBeNull();
    expect(findPrice('')).toBeNull();
  });

  it('自定义价格优先，可新增模型，0 也是合法价格', () => {
    const custom = sanitizeCustomPrices([
      { model: 'GPT-4o', input: 1, output: 2 },
      { model: 'qwen2.5:0.5b', input: 0, output: 0 },
      { model: 'bad', input: -1, output: 1 },
      { model: '', input: 1, output: 1 },
      null,
    ]);
    expect(custom.map((c) => c.model)).toEqual(['gpt-4o', 'qwen2-5:0-5b']);
    expect(findPrice('gpt-4o', custom)).toMatchObject({ custom: true, price: { input: 1 } });
    expect(findPrice('qwen2.5:0.5b', custom)?.price).toEqual({ input: 0, output: 0 });
    // 内置的不受影响
    expect(findPrice('gpt-4o-mini', custom)?.custom).toBe(false);
  });

  it('费用：输入 / 输出 / 缓存读写分开计价，缺省缓存价按输入价', () => {
    const r = { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 };
    expect(costUsd(r, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 })).toBeCloseTo(
      22.05,
      6,
    );
    expect(costUsd(r, { input: 2, output: 8 })).toBeCloseTo(2 + 8 + 2 + 2, 6);
  });

  it('内置表无重复、价格都是有限非负数', () => {
    const names = BUILTIN_PRICES.map((p) => p.model);
    expect(new Set(names).size).toBe(names.length);
    for (const p of BUILTIN_PRICES) {
      expect(p.input).toBeGreaterThanOrEqual(0);
      expect(p.output).toBeGreaterThan(0);
      expect(normalizeModel(p.model)).toBe(p.model);
    }
  });
});
