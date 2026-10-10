import {
  ToolRegistryKey,
  UserProfileKey,
  type ToolDefinition,
  type ToolRegistry,
  type UserProfile,
  type UserProfileService,
} from '@ig-live/bundle-ig-base';
import { describe, expect, it } from 'vitest';

import { Live2dSeamPlugin } from '../../src/plugins/Live2dSeamPlugin';
import {
  buildWaifuSystemPrompt,
  WaifuAgentPresetPlugin,
} from '../../src/plugins/WaifuAgentPresetPlugin';
import {
  playMotionInputSchema,
  setExpressionInputSchema,
  WaifuToolsPlugin,
} from '../../src/plugins/WaifuToolsPlugin';
import { AgentPresetRegistryKey } from '../../src/seams/agentPreset';
import { Live2dKey } from '../../src/seams/live2d';
import { createFakeCtx } from '../helpers/fakeCtx';
import { createFakeLive2dHost } from '../helpers/fakeLive2dHost';

function createFakeRegistry(): ToolRegistry {
  const map = new Map<string, ToolDefinition>();
  return {
    register(tool) {
      map.set(tool.name, tool as ToolDefinition);
    },
    get(name) {
      return map.get(name);
    },
    list() {
      return [...map.values()];
    },
  };
}

function createFakeProfile(data: Partial<Record<string, unknown>>): UserProfileService {
  return {
    get(): UserProfile {
      return {} as UserProfile;
    },
    getPath<T = unknown>(path: string): T | undefined {
      return data[path] as T | undefined;
    },
    set: async () => ({}) as UserProfile,
    reset: async () => ({}) as UserProfile,
    subscribe: () => () => undefined,
    export: async () => ({}) as UserProfile,
    import: async () => ({}) as UserProfile,
  };
}

describe('WaifuToolsPlugin schema', () => {
  it('play_motion accepts valid input', () => {
    expect(playMotionInputSchema.parse({ group: 'idle', index: 0 })).toEqual({
      group: 'idle',
      index: 0,
    });
    expect(playMotionInputSchema.parse({ group: 'idle' })).toEqual({ group: 'idle' });
  });

  it('play_motion rejects extra keys and negative index', () => {
    expect(() => playMotionInputSchema.parse({ group: 'idle', extra: 1 })).toThrow();
    expect(() => playMotionInputSchema.parse({ group: 'idle', index: -1 })).toThrow();
    expect(() => playMotionInputSchema.parse({ group: '' })).toThrow();
  });

  it('set_expression validates non-empty name', () => {
    expect(() => setExpressionInputSchema.parse({ name: '' })).toThrow();
    expect(setExpressionInputSchema.parse({ name: 'smile' })).toEqual({ name: 'smile' });
  });
});

describe('WaifuToolsPlugin', () => {
  async function setup(cfg: Parameters<typeof WaifuToolsPlugin.apply>[1] = {}) {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    const host = createFakeLive2dHost();
    svc.attachHost(host);
    const registry = createFakeRegistry();
    ctx.provide(ToolRegistryKey, registry);
    await WaifuToolsPlugin.apply(ctx, cfg);
    return { ctx, host, registry };
  }

  it('registers live2d_play_motion and live2d_set_expression', async () => {
    const { registry } = await setup();
    expect(
      registry
        .list()
        .map((t) => t.name)
        .sort(),
    ).toEqual(['live2d_play_motion', 'live2d_set_expression']);
  });

  it('autoConfirm=true marks tools as dangerous=false', async () => {
    const { registry } = await setup({ autoConfirm: true });
    for (const tool of registry.list()) {
      expect(tool.dangerous).toBe(false);
    }
  });

  it('autoConfirm=false marks tools as dangerous=true', async () => {
    const { registry } = await setup({ autoConfirm: false });
    for (const tool of registry.list()) {
      expect(tool.dangerous).toBe(true);
    }
  });

  it('tool execute drives Live2dService and returns ok', async () => {
    const { registry, host } = await setup();
    const play = registry.get('live2d_play_motion')!;
    const expr = registry.get('live2d_set_expression')!;
    await expect(play.execute({ group: 'idle', index: 2 }, {})).resolves.toEqual({ ok: true });
    await expect(expr.execute({ name: 'smile' }, {})).resolves.toEqual({ ok: true });
    expect(host.record.playMotion).toEqual([{ group: 'idle', index: 2 }]);
    expect(host.record.setExpression).toEqual(['smile']);
  });

  it('warns and skips when tool registry not available', async () => {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    await WaifuToolsPlugin.apply(ctx, {});
    expect(
      ctx.logs.some((l) => l.level === 'warn' && l.msg.includes('ctx.tools not available')),
    ).toBe(true);
  });
});

describe('buildWaifuSystemPrompt', () => {
  it('picks cute tone by default when profile absent', () => {
    const prompt = buildWaifuSystemPrompt(undefined, { toolNames: [] });
    expect(prompt).toContain('看板娘');
    expect(prompt).toContain('可爱');
  });

  it('uses tone value from profile.preferences.tone', () => {
    const profile = createFakeProfile({
      'preferences.tone': { value: 'strict' },
    });
    const prompt = buildWaifuSystemPrompt(profile, { toolNames: [] });
    expect(prompt).toContain('严谨');
  });

  it('includes nickname and tool listing', () => {
    const profile = createFakeProfile({
      'preferences.tone': { value: 'casual' },
      'identity.nickname': '小明',
    });
    const prompt = buildWaifuSystemPrompt(profile, {
      toolNames: ['live2d_play_motion', 'echo'],
      prefix: '（内部前缀）',
    });
    expect(prompt.startsWith('（内部前缀）')).toBe(true);
    expect(prompt).toContain('小明');
    expect(prompt).toContain('live2d_play_motion, echo');
    expect(prompt).toContain('轻松');
  });

  it('unknown tone falls back to cute line', () => {
    const profile = createFakeProfile({
      'preferences.tone': { value: 'martian' },
    });
    const prompt = buildWaifuSystemPrompt(profile, { toolNames: [] });
    expect(prompt).toContain('可爱');
  });
});

describe('WaifuAgentPresetPlugin', () => {
  async function setup(cfg: Parameters<typeof WaifuAgentPresetPlugin.apply>[1] = {}) {
    const ctx = createFakeCtx();
    await Live2dSeamPlugin.apply(ctx, {});
    const svc = ctx.inject(Live2dKey)!;
    svc.attachHost(createFakeLive2dHost());
    ctx.provide(ToolRegistryKey, createFakeRegistry());
    await WaifuToolsPlugin.apply(ctx, {});
    const profile = createFakeProfile({ 'preferences.tone': { value: 'cute' } });
    ctx.provide(UserProfileKey, profile);
    await WaifuAgentPresetPlugin.apply(ctx, cfg);
    return { ctx };
  }

  it('registers a waifu preset with expected whitelist', async () => {
    const { ctx } = await setup();
    const registry = ctx.inject(AgentPresetRegistryKey);
    expect(registry).toBeDefined();
    const preset = registry!.get('waifu');
    expect(preset).toBeDefined();
    expect(preset!.toolWhitelist).toEqual([
      'live2d_play_motion',
      'live2d_set_expression',
      'time_now',
      'random',
      'echo',
    ]);
    expect(preset!.disable).toEqual(['mcp', 'http_get_readonly']);
  });

  it('systemPrompt is dynamic and reads current UserProfile', async () => {
    const { ctx } = await setup();
    const registry = ctx.inject(AgentPresetRegistryKey)!;
    const preset = registry.get('waifu')!;
    const prompt = await preset.systemPrompt();
    expect(prompt).toContain('可爱');
    expect(prompt).toContain('live2d_play_motion');
  });

  it('supports custom preset name / tools / disable via config', async () => {
    const { ctx } = await setup({
      presetName: 'waifu-plus',
      builtinTools: ['time_now'],
      disable: ['mcp'],
    });
    const registry = ctx.inject(AgentPresetRegistryKey)!;
    const preset = registry.get('waifu-plus');
    expect(preset).toBeDefined();
    expect(preset!.toolWhitelist).toEqual([
      'live2d_play_motion',
      'live2d_set_expression',
      'time_now',
    ]);
    expect(preset!.disable).toEqual(['mcp']);
    expect(registry.get('waifu')).toBeUndefined();
  });
});
