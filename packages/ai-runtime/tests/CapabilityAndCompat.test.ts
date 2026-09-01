/**
 * CapabilityIpcServer + AiChatCompat 兼容层测试。
 */

import { AIClient } from '@ig-live/ai-sdk';
import { LLMRegistryKey, ToolRegistryKey, UserProfileKey } from '@ig-live/bundle-ig-base';
import { describe, it, expect, vi } from 'vitest';

import { CAPABILITY_CHANNELS, CapabilityIpcServer } from '../src/CapabilityIpcServer';
import { LEGACY_CHANNELS, AiChatCompat } from '../src/legacy/AiChatCompat';
import { NoopRuntimeLogger } from '../src/logger';

import { createFakeIpcAdapter } from './helpers/fakeIpc';
import { createFakeSdkCtx } from './helpers/fakeSdkCtx';
import {
  createFakeLLM,
  createFakeLLMRegistry,
  createFakeProfileService,
  createFakeToolRegistry,
} from './helpers/fakeSeams';

describe('CapabilityIpcServer', () => {
  it('SEAM_NOT_INJECTED when service missing', async () => {
    const adapter = createFakeIpcAdapter();
    const server = new CapabilityIpcServer({
      adapter,
      injector: {
        getScreen: () => undefined,
        getClipboard: () => undefined,
        getKeyStore: () => undefined,
      },
      logger: NoopRuntimeLogger,
    });
    server.start();
    await expect(adapter.invoke(1, 'ai:screen:listDisplays')).rejects.toThrow(/SEAM_NOT_INJECTED/);
    server.stop();
    for (const ch of CAPABILITY_CHANNELS) expect(adapter.handlers.has(ch)).toBe(false);
  });

  it('forwards to injected services', async () => {
    const listDisplays = vi.fn(async () => [{ id: 'main' }]);
    const readText = vi.fn(async () => 'clip');
    const keyGet = vi.fn(async (id: string) => `val:${id}`);

    const adapter = createFakeIpcAdapter();
    const server = new CapabilityIpcServer({
      adapter,
      injector: {
        getScreen: () => ({ listDisplays, capture: vi.fn() }),
        getClipboard: () => ({ readText, writeText: vi.fn(), readImage: vi.fn() }),
        getKeyStore: () => ({ get: keyGet, set: vi.fn(), del: vi.fn(), list: vi.fn() }),
      },
      logger: NoopRuntimeLogger,
    });
    server.start();

    expect(await adapter.invoke(1, 'ai:screen:listDisplays')).toEqual([{ id: 'main' }]);
    expect(await adapter.invoke(1, 'ai:clipboard:readText')).toBe('clip');
    expect(await adapter.invoke(1, 'ai:keyStore:get', 'openai')).toBe('val:openai');
    server.stop();
  });
});

describe('AiChatCompat', () => {
  function bootstrap() {
    const ctx = createFakeSdkCtx();
    ctx.provide(LLMRegistryKey, createFakeLLMRegistry(createFakeLLM()));
    ctx.provide(ToolRegistryKey, createFakeToolRegistry());
    ctx.provide(UserProfileKey, createFakeProfileService());
    const client = new AIClient(ctx);
    const adapter = createFakeIpcAdapter();
    const compat = new AiChatCompat({ adapter, client, logger: NoopRuntimeLogger });
    compat.start();
    return { adapter, compat, client };
  }

  it('registers all legacy channels', () => {
    const { adapter } = bootstrap();
    for (const ch of LEGACY_CHANNELS) expect(adapter.handlers.has(ch)).toBe(true);
  });

  it('ai-chat:message:send bridges to chat.sendMessage', async () => {
    const { adapter, compat } = bootstrap();
    const res = (await adapter.invoke(1, 'ai-chat:message:send', {
      message: 'hi',
      modelId: 'fake',
    })) as { content?: string };
    expect(res.content).toBe('ok');
    expect(compat.stats()['ai-chat:message:send']).toBe(1);
  });

  it('ai-chat:message:stream returns ack and emits chunks via sender.send', async () => {
    const { adapter, compat } = bootstrap();
    const ack = (await adapter.invoke(7, 'ai-chat:message:stream', {
      message: 'hi',
      modelId: 'fake',
    })) as { ok: boolean };
    expect(ack.ok).toBe(true);
    // 等 stream 完成
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const stream = adapter.senderStreams.get(7) ?? [];
    const chunks = stream.filter((s) => s.channel === 'ai-chat:message:chunk');
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[chunks.length - 1]!.payload).toBe(''); // 终结标记
    expect(compat.stats()['ai-chat:message:stream']).toBe(1);
  });

  it('deprecation callback fires per call', async () => {
    const ctx = createFakeSdkCtx();
    ctx.provide(LLMRegistryKey, createFakeLLMRegistry(createFakeLLM()));
    ctx.provide(ToolRegistryKey, createFakeToolRegistry());
    ctx.provide(UserProfileKey, createFakeProfileService());
    const client = new AIClient(ctx);
    const adapter = createFakeIpcAdapter();
    const onDeprecation = vi.fn();
    const compat = new AiChatCompat({ adapter, client, logger: NoopRuntimeLogger, onDeprecation });
    compat.start();

    await adapter.invoke(1, 'ai-chat:config:get');
    await adapter.invoke(1, 'ai-chat:config:get');

    expect(onDeprecation).toHaveBeenCalledTimes(2);
    expect(onDeprecation.mock.calls[0]![0]).toBe('ai-chat:config:get');
    expect(onDeprecation.mock.calls[0]![1]).toBe(1);
    compat.stop();
  });

  it('stop() removes handlers', () => {
    const { adapter, compat } = bootstrap();
    compat.stop();
    for (const ch of LEGACY_CHANNELS) expect(adapter.handlers.has(ch)).toBe(false);
  });
});
