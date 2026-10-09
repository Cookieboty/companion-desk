import { LLMRegistryKey, ToolRegistryKey, UserProfileKey, echoTool } from '@ig-live/bundle-ig-base';
import { describe, expect, it, vi } from 'vitest';

import { AiSdkLlmProvider } from '../src/ai-sdk/AiSdkLlmProvider';
import { toAiSdkToolSet } from '../src/ai-sdk/mapTools';
import { createAiSdkBooter, defaultAiSdkPlugins } from '../src/AiSdkBooter';
import { NoopRuntimeLogger } from '../src/logger';

describe('createAiSdkBooter', () => {
  it('boots IgPluginHost with AI SDK providers (no dsh)', async () => {
    const booter = createAiSdkBooter({
      logger: NoopRuntimeLogger,
      env: { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: 'http://127.0.0.1:9/v1' },
    });
    const ctx = await booter.boot('waifu', { home: '/tmp' });
    const ids = ctx
      .inject(LLMRegistryKey)!
      .list()
      .map((p) => p.id);
    expect(ids).toEqual(['deepseek', 'ollama', 'openai']);
    const deepseek = ctx.inject(LLMRegistryKey)!.get('deepseek');
    expect(deepseek).toBeInstanceOf(AiSdkLlmProvider);
    expect(
      ctx
        .inject(ToolRegistryKey)!
        .list()
        .map((t) => t.name),
    ).toEqual(expect.arrayContaining(['time_now', 'echo']));
    expect(ctx.inject(UserProfileKey)!.get()).toHaveProperty('identity');
    await booter.dispose?.();
  });

  it('defaultAiSdkPlugins swaps LLMProvidersPlugin for AiSdkLLMProvidersPlugin', () => {
    const names = defaultAiSdkPlugins('waifu').map((e) => e.plugin.name);
    expect(names).toContain('AiSdkLLMProvidersPlugin');
    expect(names).not.toContain('LLMProvidersPlugin');
  });
});

describe('toAiSdkToolSet', () => {
  it('maps ToolDefinition to an executable AI SDK tool', async () => {
    const set = toAiSdkToolSet([echoTool]);
    expect(Object.keys(set)).toEqual(['echo']);
    const out = await set.echo!.execute!({ text: 'hi' }, {
      toolCallId: 't1',
      messages: [],
      abortSignal: undefined as never,
    } as never);
    expect(out).toBe('hi');
  });
});

describe('AiSdkLlmProvider', () => {
  it('assertKey throws when api key required but missing', async () => {
    const p = new AiSdkLlmProvider({
      id: 'deepseek',
      baseURL: 'http://127.0.0.1:9/v1',
      requiresApiKey: true,
    });
    await expect(
      p.chat({
        reqId: 'r1',
        provider: 'deepseek',
        model: 'default',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/API key is not configured/);
  });

  it('folds ChatMessage system roles into AI SDK instructions (AI SDK 7)', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role: string; content: string }>;
      };
      // OpenAI wire format may still carry a system message; the important part is
      // generateText no longer rejects our ChatMessage[] that includes role:system.
      expect(body.messages?.some((m) => m.role === 'user')).toBe(true);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const p = new AiSdkLlmProvider({
      id: 'openai',
      baseURL: 'http://127.0.0.1:9/v1',
      apiKey: 'sk',
      requiresApiKey: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const resp = await p.chat({
      reqId: 'r-sys',
      provider: 'openai',
      model: 'mock',
      messages: [
        { role: 'system', content: 'you are helpful' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(resp.content).toBe('ok');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('streams deltas from a mock OpenAI-compatible server', async () => {
    const fetchImpl = vi.fn(async () => {
      const body = [
        'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    const p = new AiSdkLlmProvider({
      id: 'openai',
      baseURL: 'http://127.0.0.1:9/v1',
      apiKey: 'sk',
      requiresApiKey: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunks: string[] = [];
    for await (const c of p.stream({
      reqId: 'r2',
      provider: 'openai',
      model: 'mock',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    })) {
      if (c.type === 'delta') chunks.push(c.content);
    }
    expect(chunks.join('')).toContain('hel');
    expect(fetchImpl).toHaveBeenCalled();
  });
});
