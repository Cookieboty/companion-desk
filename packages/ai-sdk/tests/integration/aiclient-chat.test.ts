/**
 * P5-7 集成测试 · 场景 1：chat.stream() 端到端返回 chunks + AIClient.on('tool:executed') 桥接
 */

import { LLMRegistryKey, ToolRegistryKey, UserProfileKey } from '@ig-live/bundle-ig-base';
import { describe, expect, it } from 'vitest';

import { AIClient } from '../../src/AIClient';
import { createFakeSdkCtx } from '../helpers/fakeSdkCtx';
import {
  createFakeLLM,
  createFakeLLMRegistry,
  createFakeProfileService,
  createFakeToolRegistry,
} from '../helpers/fakeSeams';

function wire() {
  const ctx = createFakeSdkCtx();
  const llm = createFakeLLM('fake');
  ctx.provide(LLMRegistryKey, createFakeLLMRegistry(llm));
  ctx.provide(ToolRegistryKey, createFakeToolRegistry());
  ctx.provide(UserProfileKey, createFakeProfileService());
  return { ctx, llm };
}

describe('AIClient · chat', () => {
  it('stream returns chunks end-to-end', async () => {
    const { ctx, llm } = wire();
    const client = new AIClient(ctx);
    const chunks: string[] = [];
    for await (const c of client.chat.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
      if (c.type === 'delta') chunks.push(c.content);
      if (c.type === 'done') expect(c.finishReason).toBe('stop');
    }
    expect(chunks.join('')).toBe('hello');
    expect(llm.streamCalls).toHaveLength(1);
    expect(llm.streamCalls[0]!.messages[0]!.content).toBe('hi');
    await client.dispose();
  });

  it('sendMessage returns non-stream response', async () => {
    const { ctx } = wire();
    const client = new AIClient(ctx);
    const resp = await client.chat.sendMessage({
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(resp.finishReason).toBe('stop');
    expect(resp.content).toBe('ok');
    await client.dispose();
  });

  it('abort forwards to provider', async () => {
    const { ctx, llm } = wire();
    const client = new AIClient(ctx);
    client.chat.abort('r-42');
    expect(llm.aborted).toContain('r-42');
    await client.dispose();
  });

  it('regenerate uses a fresh reqId', async () => {
    const { ctx, llm } = wire();
    const client = new AIClient(ctx);
    const it1 = client.chat.regenerate({
      reqId: 'ignored',
      messages: [{ role: 'user', content: 'a' }],
    });
    for await (const _ of it1) {
      /* drain */
    }
    expect(llm.streamCalls[0]!.reqId).not.toBe('ignored');
    await client.dispose();
  });
});

describe('AIClient · events bridge', () => {
  it('agent:turn-end bridged from dsh agent/turn-end', async () => {
    const { ctx } = wire();
    const client = new AIClient(ctx);
    const seen: unknown[] = [];
    const off = client.on('agent:turn-end', (p) => seen.push(p));
    await ctx.triggerEvent('agent/turn-end', {
      sessionId: 's1',
      turnId: 't1',
      ok: true,
    });
    off();
    expect(seen).toEqual([{ sessionId: 's1', turnId: 't1', ok: true }]);
    await client.dispose();
  });

  it('tool:confirm-required bridged from dsh tool/confirm-required', async () => {
    const { ctx } = wire();
    const client = new AIClient(ctx);
    const seen: unknown[] = [];
    client.on('tool:confirm-required', (p) => seen.push(p));
    await ctx.triggerEvent('tool/confirm-required', {
      reqId: 'r1',
      toolName: 'echo',
      argumentsJson: '{}',
      createdAt: 1,
    });
    expect(seen).toHaveLength(1);
    await client.dispose();
  });

  it('dispose clears all listeners; on() after dispose throws DISPOSED', async () => {
    const { ctx } = wire();
    const client = new AIClient(ctx);
    let hits = 0;
    client.on('agent:turn-end', () => hits++);
    await client.dispose();
    await ctx.triggerEvent('agent/turn-end', { sessionId: 's', turnId: 't', ok: true });
    expect(hits).toBe(0);
    expect(() => client.on('agent:turn-end', () => {})).toThrow(/AICLIENT_DISPOSED/);
  });
});
