import {
  McpKey,
  ToolRegistryKey,
  ToolsBuiltinPlugin,
  type McpServerConfig,
  type ToolDefinition,
  type ToolRegistry,
} from '@ig-live/bundle-ig-base';
import { describe, expect, it, vi } from 'vitest';

import { AiSdkMcpPlugin } from '../src/ai-sdk/AiSdkMcpPlugin';
import { toAiSdkToolSet } from '../src/ai-sdk/mapTools';
import {
  AiSdkMcpService,
  formatMcpToolResult,
  provideAiSdkMcpService,
} from '../src/ai-sdk/mcpBridge';
import { createAiSdkBooter, defaultAiSdkPlugins } from '../src/AiSdkBooter';
import { createIgPluginHost } from '../src/IgPluginHost';
import { mcpAutoConnectFromEnv, mcpServersFromEnv } from '../src/igPlugins';
import { NoopRuntimeLogger } from '../src/logger';

function mockRegistry(): ToolRegistry & { map: Map<string, ToolDefinition> } {
  const map = new Map<string, ToolDefinition>();
  return {
    map,
    register(tool) {
      map.set(tool.name, tool as ToolDefinition);
    },
    get(name) {
      return map.get(name);
    },
    list() {
      return [...map.values()];
    },
    unregister(name) {
      return map.delete(name);
    },
  };
}

describe('mcpServersFromEnv', () => {
  it('parses MCP_SERVERS JSON array', () => {
    const servers = mcpServersFromEnv({
      MCP_SERVERS: JSON.stringify([
        {
          id: 'demo',
          name: 'Demo',
          transport: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer x' },
        },
        { id: 'bad', transport: 'ftp' },
      ]),
    });
    expect(servers).toEqual([
      {
        id: 'demo',
        name: 'Demo',
        transport: 'http',
        url: 'https://example.com/mcp',
        command: undefined,
        args: undefined,
        env: undefined,
        headers: { Authorization: 'Bearer x' },
      },
    ]);
  });

  it('returns [] on invalid JSON', () => {
    expect(mcpServersFromEnv({ MCP_SERVERS: '{nope' })).toEqual([]);
  });

  it('mcpAutoConnectFromEnv reads truthy flags', () => {
    expect(mcpAutoConnectFromEnv({ MCP_AUTO_CONNECT: 'true' })).toBe(true);
    expect(mcpAutoConnectFromEnv({ MCP_AUTO_CONNECT: '1' })).toBe(true);
    expect(mcpAutoConnectFromEnv({})).toBe(false);
  });
});

describe('formatMcpToolResult', () => {
  it('returns structuredContent when present', () => {
    expect(formatMcpToolResult({ structuredContent: { ok: 1 } })).toEqual({ ok: 1 });
  });

  it('joins text content', () => {
    expect(
      formatMcpToolResult({
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      }),
    ).toBe('a\nb');
  });

  it('throws on isError', () => {
    expect(() =>
      formatMcpToolResult({
        isError: true,
        content: [{ type: 'text', text: 'boom' }],
      }),
    ).toThrow(/boom/);
  });
});

describe('AiSdkMcpService', () => {
  it('registers MCP tools into ToolRegistry and unregisters on disconnect', async () => {
    const registry = mockRegistry();
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text', text: 'pong' }],
    }));
    const close = vi.fn(async () => {});
    const createClient = vi.fn(async () => ({
      listTools: async () => ({
        tools: [
          {
            name: 'ping',
            description: 'Ping tool',
            inputSchema: {
              type: 'object',
              properties: { n: { type: 'number' } },
            },
            annotations: { destructiveHint: false },
          },
        ],
      }),
      callTool,
      close,
    }));

    const svc = new AiSdkMcpService({
      getRegistry: () => registry,
      createClient: createClient as never,
      prefixToolNames: true,
    });

    const cfg: McpServerConfig = {
      id: 'demo',
      name: 'Demo',
      transport: 'http',
      url: 'https://example.com/mcp',
    };
    await svc.connect(cfg);

    expect(registry.list().map((t) => t.name)).toEqual(['demo__ping']);
    const out = await registry.get('demo__ping')!.execute({ n: 1 }, {});
    expect(out).toBe('pong');
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ping', arguments: { n: 1 } }),
    );

    // Mapped tools are executable via AI SDK tool() path
    const set = toAiSdkToolSet(registry.list());
    expect(Object.keys(set)).toEqual(['demo__ping']);

    await svc.disconnect('demo');
    expect(registry.list()).toEqual([]);
    expect(close).toHaveBeenCalled();
  });

  it('provideAiSdkMcpService is reused by McpBridgePlugin path', async () => {
    const host = createIgPluginHost({ logger: NoopRuntimeLogger });
    await host.apply([
      { plugin: ToolsBuiltinPlugin, config: { enable: ['echo'] } },
      { plugin: AiSdkMcpPlugin, config: { servers: [], autoConnect: false } },
    ]);
    const svc = host.ctx.inject(McpKey);
    expect(svc).toBeInstanceOf(AiSdkMcpService);
    // second provide is idempotent
    const again = provideAiSdkMcpService(host.ctx);
    expect(again).toBe(svc);
    await host.dispose();
  });
});

describe('defaultAiSdkPlugins MCP wiring', () => {
  it('inserts AiSdkMcpPlugin before McpBridgePlugin', () => {
    const names = defaultAiSdkPlugins('waifu', {
      env: {
        MCP_SERVERS: JSON.stringify([
          { id: 'x', name: 'X', transport: 'sse', url: 'https://x/sse' },
        ]),
      },
    }).map((e) => e.plugin.name);
    const mcpIdx = names.indexOf('AiSdkMcpPlugin');
    const bridgeIdx = names.indexOf('McpBridgePlugin');
    expect(mcpIdx).toBeGreaterThanOrEqual(0);
    expect(bridgeIdx).toBeGreaterThan(mcpIdx);
  });

  it('boots with MCP service available alongside builtin tools', async () => {
    const booter = createAiSdkBooter({
      logger: NoopRuntimeLogger,
      env: { DEEPSEEK_API_KEY: 'sk-test' },
    });
    const ctx = await booter.boot('waifu', { home: '/tmp' });
    expect(ctx.inject(McpKey)).toBeInstanceOf(AiSdkMcpService);
    expect(
      ctx
        .inject(ToolRegistryKey)!
        .list()
        .map((t) => t.name),
    ).toEqual(expect.arrayContaining(['echo', 'time_now']));
    await booter.dispose?.();
  });
});
