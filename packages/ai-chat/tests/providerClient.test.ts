import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  endpointPreview,
  providerClient,
  selectableModels,
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
    expect(invoke).toHaveBeenCalledWith('ai:providers:setActive', 'p-1', undefined);
    await providerClient.setActive('p-1', 'm-2');
    expect(invoke).toHaveBeenLastCalledWith('ai:providers:setActive', 'p-1', 'm-2');
    await expect(providerClient.remove('x')).rejects.toThrow("provider 'x' 不存在");
  });

  it('lists enabled store providers then env providers', () => {
    const s = {
      providers: [
        { id: 'p-1', name: 'A', enabled: true, keys: [], usage },
        { id: 'p-2', name: 'B', enabled: false, keys: [], usage },
      ],
      envProviders: [
        { id: 'deepseek', name: 'DeepSeek（环境变量）', hasKey: false, usage },
        { id: 'ollama', name: 'Ollama（环境变量）', hasKey: true, usage },
      ],
    } as unknown as ProviderState;
    expect(selectableProviders(s)).toEqual([
      { id: 'p-1', label: 'A', disabled: false },
      { id: 'ollama', label: 'Ollama（环境变量）', disabled: false },
    ]);
  });

  it('model picker lists enabled → fetched → default', () => {
    const s = {
      providers: [
        { id: 'p-1', defaultModel: 'a', models: ['a', 'b'], fetchedModels: [{ id: 'z' }] },
        { id: 'p-2', defaultModel: 'x', models: [], fetchedModels: [{ id: 'y' }] },
      ],
      envProviders: [{ id: 'deepseek', defaultModel: 'deepseek-chat' }],
    } as unknown as ProviderState;
    expect(selectableModels(s, 'p-1')).toEqual(['a', 'b']);
    expect(selectableModels(s, 'p-2')).toEqual(['x', 'y']);
    expect(selectableModels(s, 'deepseek')).toEqual(['deepseek-chat']);
    expect(selectableModels(s, undefined)).toEqual([]);
  });

  it('endpoint preview mirrors main-process URL building', () => {
    expect(endpointPreview('openai-chat', 'https://a/v1/', false)).toBe(
      'https://a/v1/chat/completions',
    );
    expect(endpointPreview('openai-responses', 'https://a/v1', false)).toBe(
      'https://a/v1/responses',
    );
    expect(endpointPreview('anthropic', 'https://a', false)).toBe('https://a/v1/messages');
    expect(endpointPreview('anthropic', 'https://a/x', true)).toBe('https://a/x');
  });
});
