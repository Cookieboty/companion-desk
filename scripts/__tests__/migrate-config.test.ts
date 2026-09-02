import { describe, expect, it } from 'vitest';

import { migrateLegacyConfig } from '../lib/migrate/config';
import type { LegacyAppConfig } from '../lib/migrate/types';

const FIXTURE: LegacyAppConfig = {
  chat: { theme: 'dark', language: 'zh-CN', fontSize: 14, autoSave: true, maxHistoryLength: 100 },
  currentModelId: 'deepseek-main',
  models: [
    {
      id: 'deepseek-main',
      name: 'DeepSeek Chat',
      provider: 'deepseek',
      apiKey: 'sk-DS-XXXXX',
      apiUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
    },
    {
      id: 'openai-secondary',
      name: 'OpenAI GPT-4o',
      provider: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      enabled: false,
    },
    {
      id: 'local-ollama',
      name: 'Ollama Local',
      provider: 'ollama',
      apiUrl: 'http://127.0.0.1:11434',
      model: 'llama3',
      enabled: true,
      isLocal: true,
    },
  ],
};

describe('migrateLegacyConfig', () => {
  it('生成 provider patch 并保留 currentModelId 作为默认', () => {
    const r = migrateLegacyConfig(FIXTURE);
    expect(r.providers.map((p) => p.id)).toEqual([
      'deepseek-main',
      'openai-secondary',
      'local-ollama',
    ]);
    expect(r.defaultProviderId).toBe('deepseek-main');
    expect(r.skipped).toEqual([]);

    const deepseek = r.providers[0];
    expect(deepseek).toMatchObject({
      id: 'deepseek-main',
      displayName: 'DeepSeek Chat',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
      isLocal: false,
      keyRef: 'provider.deepseek-main.apiKey',
    });

    const openai = r.providers[1];
    expect(openai.keyRef).toBeUndefined();
    expect(openai.isLocal).toBe(false);

    const ollama = r.providers[2];
    expect(ollama.isLocal).toBe(true);
    expect(ollama.keyRef).toBeUndefined();
  });

  it('仅为带 apiKey 的条目生成 keyEntry', () => {
    const r = migrateLegacyConfig(FIXTURE);
    expect(r.keyEntries).toEqual([
      { keyRef: 'provider.deepseek-main.apiKey', secret: 'sk-DS-XXXXX' },
    ]);
  });

  it('无 currentModelId 时回退到首个 enabled provider', () => {
    const r = migrateLegacyConfig({
      models: [
        { id: 'a', name: 'A', provider: 'openai', apiUrl: 'x', model: 'y', enabled: false },
        { id: 'b', name: 'B', provider: 'openai', apiUrl: 'x', model: 'y', enabled: true },
      ],
    });
    expect(r.defaultProviderId).toBe('b');
  });

  it('对不合法条目走 skipped，不抛异常', () => {
    const r = migrateLegacyConfig({
      currentModelId: 'ghost',
      models: [
        // @ts-expect-error 故意缺 apiUrl
        { id: 'no-url', name: 'x', provider: 'openai', model: 'y', enabled: true },
        // @ts-expect-error provider 非法
        {
          id: 'bad-provider',
          name: 'x',
          provider: 'llama',
          apiUrl: 'a',
          model: 'b',
          enabled: true,
        },
        // 重复 id
        { id: 'dup', name: 'x', provider: 'openai', apiUrl: 'a', model: 'b', enabled: true },
        { id: 'dup', name: 'x', provider: 'openai', apiUrl: 'a', model: 'b', enabled: true },
      ],
    });
    expect(r.providers.map((p) => p.id)).toEqual(['dup']);
    expect(r.skipped).toEqual([
      { id: 'no-url', reason: 'missing apiUrl' },
      { id: 'bad-provider', reason: 'invalid provider "llama"' },
      { id: 'dup', reason: 'duplicate id' },
    ]);
    // currentModelId 指向不存在的条目 → 回退到 enabled 的首个
    expect(r.defaultProviderId).toBe('dup');
  });

  it('models 缺省或非数组时返回空结果', () => {
    expect(migrateLegacyConfig({}).providers).toEqual([]);
    // @ts-expect-error 故意传错类型
    expect(migrateLegacyConfig({ models: 'oops' }).providers).toEqual([]);
  });
});
