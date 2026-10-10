/**
 * ChatFacade · 多 provider 路由：registry.resolve(role) 决定默认 provider 与模型。
 */
import { LLMRegistryKey, type LLMProvider, type LLMRole } from '@ig-live/bundle-ig-base';
import { describe, expect, it } from 'vitest';

import { AIClient } from '../../src/AIClient';
import { createFakeSdkCtx } from '../helpers/fakeSdkCtx';
import { createFakeLLM } from '../helpers/fakeSeams';

describe('AIClient · provider routing', () => {
  it('uses resolve(role) when no provider is given; explicit id wins', async () => {
    const a = createFakeLLM('a');
    const b = createFakeLLM('b');
    const roles: Array<LLMRole | undefined> = [];
    const ctx = createFakeSdkCtx();
    ctx.provide(LLMRegistryKey, {
      register() {},
      get: (id: string) => ({ a, b })[id as 'a' | 'b'] as LLMProvider | undefined,
      list: () => [a, b],
      resolve(role?: LLMRole) {
        roles.push(role);
        return role === 'agent-tools' ? { provider: b, model: 'tool-model' } : { provider: b };
      },
    });
    const client = new AIClient(ctx);
    await client.chat.sendMessage({ messages: [{ role: 'user', content: 'x' }] });
    expect(b.chatCalls).toHaveLength(1);
    await client.chat.agent({ messages: [{ role: 'user', content: 'x' }] });
    expect(b.chatCalls[1]!.model).toBe('tool-model');
    await client.chat.sendMessage({ role: 'summary', messages: [{ role: 'user', content: 'x' }] });
    expect(roles).toEqual(['chat', 'agent-tools', 'summary']);
    await client.chat.sendMessage({ provider: 'a', messages: [{ role: 'user', content: 'x' }] });
    expect(a.chatCalls).toHaveLength(1);
    await client.dispose();
  });
});
