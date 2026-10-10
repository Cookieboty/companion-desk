import { providerMenuEntries } from '../../../src/core/TrayManager';

const usage = { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };

describe('providerMenuEntries', () => {
  it('lists enabled stored providers then env providers, checking the effective one', () => {
    const entries = providerMenuEntries({
      providers: [
        {
          id: 'p-a',
          presetId: 'openai',
          name: 'Work OpenAI',
          backend: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          enabled: true,
          active: true,
          keys: [{ id: 'k1', masked: 'sk-…1234', encryption: 'safeStorage', createdAt: 0 }],
          usage,
          source: 'store',
        },
        {
          id: 'p-b',
          presetId: 'zhipu',
          name: 'Disabled',
          backend: 'openai-compatible',
          baseURL: 'https://x/v1',
          defaultModel: 'm',
          enabled: false,
          active: false,
          keys: [],
          usage,
          source: 'store',
        },
      ],
      envProviders: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          hasKey: false,
          keyless: false,
          active: false,
          usage,
          source: 'env',
        },
      ],
      activeProviderId: 'p-a',
      effectiveProviderId: 'p-a',
      routes: {},
      roles: ['chat', 'agent-tools', 'summary'],
      encryption: 'safeStorage',
    });
    expect(entries).toEqual([
      { id: 'p-a', label: 'Work OpenAI', checked: true, enabled: true },
      { id: 'deepseek', label: 'DeepSeek · 环境变量（无 key）', checked: false, enabled: false },
    ]);
  });
});
