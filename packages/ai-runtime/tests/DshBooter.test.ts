import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LLMRegistryKey,
  ToolRegistryKey,
  UserProfileKey,
  definePlugin,
  defineService,
} from '@ig-live/bundle-ig-base';
import { describe, expect, it, vi } from 'vitest';

import { createDshBooter } from '../src/DshBooter';
import { createIgPluginHost } from '../src/IgPluginHost';
import { defaultIgPlugins, llmProvidersFromEnv } from '../src/igPlugins';
import { NoopRuntimeLogger } from '../src/logger';

describe('IgPluginHost', () => {
  it('provide/inject by ServiceKey, per-plugin config, emit → on hooks', async () => {
    const Key = defineService<{ n: number }>('test.key');
    const seen: unknown[] = [];
    const host = createIgPluginHost({ logger: NoopRuntimeLogger, extras: { dsh: 'core' } });
    await host.apply([
      {
        plugin: definePlugin<{ n: number }>({
          name: 'A',
          apply(ctx, cfg) {
            expect(ctx.config<{ n: number }>()).toEqual(cfg);
            ctx.provide(Key, { n: cfg.n });
          },
        }),
        config: { n: 7 },
      },
      {
        plugin: definePlugin({
          name: 'B',
          apply(ctx) {
            ctx.on('tts/end', ({ payload }) => {
              seen.push(payload);
            });
            ctx.on('tts/end', ({ reject }) => reject('blocked'));
            ctx.on('tts/end', () => {
              seen.push('not reached');
            });
          },
        }),
      },
    ]);
    expect(host.ctx.inject(Key)).toEqual({ n: 7 });
    expect((host.ctx as unknown as { dsh: string }).dsh).toBe('core');
    expect(host.applied).toEqual(['A', 'B']);
    host.ctx.emit('tts/end', { id: 1 });
    await host.flush();
    expect(seen).toEqual([{ id: 1 }]);
    await host.dispose();
    expect(host.ctx.inject(Key)).toBeUndefined();
  });
});

describe('llmProvidersFromEnv', () => {
  it('keyed cloud providers first, then ollama, then key-less cloud providers', () => {
    expect(llmProvidersFromEnv({}).map((p) => p.id)).toEqual(['ollama', 'deepseek', 'openai']);
    const list = llmProvidersFromEnv({
      OPENAI_API_KEY: 'sk-o',
      OPENAI_BASE_URL: 'http://127.0.0.1:9999/v1',
      OLLAMA_MODEL: 'llama3.2',
      DEEPSEEK_API_KEY: ' ',
    });
    expect(list.map((p) => p.id)).toEqual(['openai', 'ollama', 'deepseek']);
    expect(list[0]).toMatchObject({ apiKey: 'sk-o', baseURL: 'http://127.0.0.1:9999/v1' });
    expect(list[1]).toMatchObject({ model: 'llama3.2' });
    expect(list[2]!.apiKey).toBeUndefined();
  });
});

describe('createDshBooter', () => {
  it('core=off: applies default ig plugins → LLM registry, tools, userProfile', async () => {
    const booter = createDshBooter({
      core: 'off',
      logger: NoopRuntimeLogger,
      plugins: (p) => defaultIgPlugins(p, { env: { DEEPSEEK_API_KEY: 'k' } }),
    });
    const ctx = await booter.boot('waifu', { home: '/nonexistent' });
    expect(
      ctx
        .inject(LLMRegistryKey)!
        .list()
        .map((p) => p.id),
    ).toEqual(['deepseek', 'ollama', 'openai']);
    expect(
      ctx
        .inject(ToolRegistryKey)!
        .list()
        .map((t) => t.name),
    ).toEqual(expect.arrayContaining(['time_now', 'echo']));
    expect(ctx.inject(UserProfileKey)!.get()).toHaveProperty('identity');
    await booter.dispose?.();
  });

  it('core=auto: dsh boot failure is logged and the ig host still starts', async () => {
    const warn = vi.fn();
    const booter = createDshBooter({
      core: 'auto',
      installAnchor: '/definitely/not/here/package.json',
      logger: { ...NoopRuntimeLogger, warn },
      plugins: () => [],
    });
    const ctx = await booter.boot('waifu', { home: '/nonexistent' });
    expect(ctx.inject).toBeTypeOf('function');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dsh core not started'));
    await booter.dispose?.();
  });

  it('core=required: dsh boot failure rejects', async () => {
    const booter = createDshBooter({
      core: 'required',
      installAnchor: '/definitely/not/here/package.json',
      logger: NoopRuntimeLogger,
      plugins: () => [],
    });
    await expect(booter.boot('waifu', { home: '/nonexistent' })).rejects.toThrow();
  });

  it('core=required: missing profile directory surfaces a dsh error', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ig-home-'));
    mkdirSync(join(home, 'profiles'));
    writeFileSync(join(home, 'profiles', 'README'), '');
    const booter = createDshBooter({
      core: 'required',
      logger: NoopRuntimeLogger,
      plugins: () => [],
    });
    await expect(booter.boot('no-such-profile', { home })).rejects.toThrow();
  });
});
