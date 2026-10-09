/**
 * AiSdkMcpService — McpService backed by `@ai-sdk/mcp` createMCPClient.
 *
 * On connect: discovers tools, registers them into ToolRegistry (same path as
 * ToolsBuiltin → ChatFacade.agent → AiSdkLlmProvider.withTools → streamText).
 * On disconnect / dispose: unregisters tools and closes the MCP client.
 */
import { createMCPClient, type MCPClient, type MCPClientConfig } from '@ai-sdk/mcp';
import {
  McpKey,
  ToolRegistryKey,
  type McpConnection,
  type McpEvent,
  type McpServerConfig,
  type McpServerInfo,
  type McpService,
  type PluginContext,
  type ToolDefinition,
  type ToolRegistry,
} from '@ig-live/bundle-ig-base';
import { jsonSchema } from 'ai';

export type CreateMcpClient = typeof createMCPClient;

export interface AiSdkMcpServiceOptions {
  /** Inject ToolRegistry; if omitted, reads from ctx on each connect. */
  getRegistry: () => ToolRegistry | undefined;
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
  /**
   * Prefix tool names with `${serverId}__` to avoid collisions with builtins
   * and across MCP servers. Default true.
   */
  prefixToolNames?: boolean;
  /** Override for tests. */
  createClient?: CreateMcpClient;
}

interface LiveServer {
  info: McpServerInfo;
  client: MCPClient;
  toolNames: string[];
}

function toolNameFor(serverId: string, name: string, prefix: boolean): string {
  return prefix ? `${serverId}__${name}` : name;
}

/** Normalize MCP callTool payload into something models can read. */
export function formatMcpToolResult(result: {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}): unknown {
  if (result.isError) {
    const msg =
      result.content
        ?.filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n') || 'MCP tool returned an error';
    throw new Error(msg);
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  const texts = (result.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string);
  if (texts.length === 1) return texts[0];
  if (texts.length > 1) return texts.join('\n');
  return result.content ?? null;
}

export async function buildTransport(cfg: McpServerConfig): Promise<{
  transport: MCPClientConfig['transport'];
  displayUrl: string;
}> {
  const transport = cfg.transport === 'websocket' ? 'http' : cfg.transport;

  if (transport === 'http' || transport === 'sse') {
    const url = cfg.url?.trim();
    if (!url) throw new Error(`MCP server '${cfg.id}': url required for ${transport}`);
    if (cfg.transport === 'websocket' && !/^https?:\/\//i.test(url)) {
      throw new Error(
        `MCP server '${cfg.id}': websocket without http(s) url is not supported; use http/sse/stdio`,
      );
    }
    return {
      transport: { type: transport, url, headers: cfg.headers },
      displayUrl: url,
    };
  }

  if (transport === 'stdio') {
    const command = cfg.command?.trim();
    if (!command) throw new Error(`MCP server '${cfg.id}': command required for stdio`);
    const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio');
    return {
      transport: new Experimental_StdioMCPTransport({
        command,
        args: cfg.args,
        env: cfg.env,
      }),
      displayUrl: [command, ...(cfg.args ?? [])].join(' '),
    };
  }

  throw new Error(`MCP server '${cfg.id}': unsupported transport '${cfg.transport}'`);
}

export class AiSdkMcpService implements McpService {
  private readonly servers = new Map<string, LiveServer>();
  private readonly listeners = new Map<McpEvent, Set<(info: McpServerInfo) => void>>();
  private readonly opts: Required<Pick<AiSdkMcpServiceOptions, 'getRegistry' | 'prefixToolNames'>> &
    AiSdkMcpServiceOptions;

  constructor(opts: AiSdkMcpServiceOptions) {
    this.opts = {
      prefixToolNames: true,
      ...opts,
    };
  }

  listServers(): McpServerInfo[] {
    return [...this.servers.values()].map((s) => ({
      ...s.info,
      toolNames: [...s.toolNames],
    }));
  }

  async connect(cfg: McpServerConfig): Promise<McpConnection> {
    if (this.servers.has(cfg.id)) {
      await this.disconnect(cfg.id);
    }

    const createClient = this.opts.createClient ?? createMCPClient;
    const { transport, displayUrl } = await buildTransport(cfg);
    const client = await createClient({ transport });

    const listed = await client.listTools();
    const registry = this.opts.getRegistry();
    const prefix = this.opts.prefixToolNames !== false;
    const toolNames: string[] = [];

    for (const t of listed.tools ?? []) {
      const registeredName = toolNameFor(cfg.id, t.name, prefix);
      const mcpName = t.name;
      const inputSchema = (t.inputSchema ?? { type: 'object', properties: {} }) as Record<
        string,
        unknown
      >;
      if (!inputSchema.type) inputSchema.type = 'object';

      const def: ToolDefinition = {
        name: registeredName,
        description: t.description ?? t.title ?? registeredName,
        input: jsonSchema(inputSchema as never),
        dangerous: t.annotations?.destructiveHint === true,
        execute: async (input, { signal }) => {
          const result = await client.callTool({
            name: mcpName,
            arguments: (input ?? {}) as Record<string, unknown>,
            options: signal ? { signal } : undefined,
          });
          return formatMcpToolResult(result as never);
        },
      };

      if (!registry) {
        this.opts.logger?.warn(
          `MCP tools discovered but ToolRegistry missing; skip register (${registeredName})`,
        );
      } else {
        registry.register(def);
      }
      toolNames.push(registeredName);
    }

    const info: McpServerInfo = {
      id: cfg.id,
      name: cfg.name,
      url: displayUrl,
      connected: true,
      toolNames: [...toolNames],
    };
    this.servers.set(cfg.id, { info, client, toolNames });
    this.fire('server:up', info);
    this.opts.logger?.info(`mcp connected: ${cfg.id} (tools: ${toolNames.join(', ') || 'none'})`);

    return {
      serverId: cfg.id,
      disconnect: async () => this.disconnect(cfg.id),
    };
  }

  async disconnect(id: string): Promise<void> {
    const live = this.servers.get(id);
    if (!live) return;
    const registry = this.opts.getRegistry();
    for (const name of live.toolNames) {
      registry?.unregister?.(name);
    }
    try {
      await live.client.close();
    } catch (err) {
      this.opts.logger?.warn(`mcp client close failed: ${id}`, err);
    }
    live.info.connected = false;
    this.servers.delete(id);
    this.fire('server:down', live.info);
  }

  on(evt: McpEvent, fn: (info: McpServerInfo) => void): () => void {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt)!.add(fn);
    return () => this.listeners.get(evt)?.delete(fn);
  }

  async dispose(): Promise<void> {
    for (const id of [...this.servers.keys()]) {
      await this.disconnect(id);
    }
  }

  private fire(evt: McpEvent, info: McpServerInfo): void {
    this.listeners.get(evt)?.forEach((fn) => {
      try {
        fn(info);
      } catch {
        /* ignore */
      }
    });
  }
}

/** Provide AiSdkMcpService on ctx (idempotent). */
export function provideAiSdkMcpService(
  ctx: PluginContext,
  opts?: Partial<AiSdkMcpServiceOptions>,
): AiSdkMcpService {
  const existing = ctx.inject(McpKey);
  if (existing instanceof AiSdkMcpService) return existing;

  const svc = new AiSdkMcpService({
    getRegistry: () => ctx.inject(ToolRegistryKey),
    logger: ctx.logger,
    ...opts,
  });
  ctx.provide(McpKey, svc);
  return svc;
}
