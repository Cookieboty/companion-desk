import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  providerClient,
  selectableProviders,
  type ProviderState,
} from '../src/services/providerClient';

const usage = { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };

describe('providerClient', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('invokes ai:providers:* and strips Electron error prefix', async () => {
    const invoke = vi.fn(async (ch: string) => {
      if (ch === 'ai:providers:remove')
        throw new Error(
          "Error invoking remote method 'ai:providers:remove': Error: provider 'x' 不存在",
        );
      return { ok: true };
    });
    (globalThis as { window?: unknown }).window = { aiIPC: { invoke, on: vi.fn() } };
    await providerClient.setActive('p-1');
    expect(invoke).toHaveBeenCalledWith('ai:providers:setActive', 'p-1');
    await expect(providerClient.remove('x')).rejects.toThrow("provider 'x' 不存在");
  });

  it('lists enabled store providers then env providers', () => {
    const s = {
      providers: [
        { id: 'p-1', name: 'A', enabled: true, keys: [], usage },
        { id: 'p-2', name: 'B', enabled: false, keys: [], usage },
      ],
      envProviders: [{ id: 'deepseek', name: 'DeepSeek', hasKey: false, usage }],
    } as unknown as ProviderState;
    expect(selectableProviders(s)).toEqual([
      { id: 'p-1', label: 'A', disabled: false },
      { id: 'deepseek', label: 'DeepSeek（环境变量，无 key）', disabled: true },
    ]);
  });
});
