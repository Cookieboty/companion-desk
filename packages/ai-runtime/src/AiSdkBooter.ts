/**
 * AiSdkBooter —— production Booter: IgPluginHost only (no dsh kernel).
 *
 * Registers Vercel AI SDK-backed LLM providers for DeepSeek / OpenAI / Claude / Gemini /
 * Ollama, wires `@ai-sdk/mcp` via AiSdkMcpPlugin + McpBridge, keeps ToolsBuiltin + the rest.
 * Optional dsh remains available via `createDshBooter({ core: 'required' })`
 * for doctor / experimental harness work.
 */
import { UserProfileKey, type PluginContext } from '@ig-live/bundle-ig-base';

import { AiSdkLLMProvidersPlugin } from './ai-sdk/AiSdkLLMProvidersPlugin';
import { AiSdkMcpPlugin } from './ai-sdk/AiSdkMcpPlugin';
import type { Booter, StartOptions } from './AIRuntimeService';
import { createIgPluginHost, type IgPluginEntry, type IgPluginHost } from './IgPluginHost';
import {
  defaultIgPlugins,
  llmProvidersFromEnv,
  mcpAutoConnectFromEnv,
  mcpServersFromEnv,
  type IgPluginsOptions,
} from './igPlugins';
import { ConsoleRuntimeLogger, type RuntimeLogger } from './logger';

export interface AiSdkBooterOptions {
  logger?: RuntimeLogger;
  /** Override plugin list; default swaps LLMProvidersPlugin → AiSdkLLMProvidersPlugin */
  plugins?: (profile: string) => IgPluginEntry[];
  env?: IgPluginsOptions['env'];
  before?: IgPluginEntry[];
  after?: IgPluginEntry[];
}

/** defaultIgPlugins with AI SDK LLM providers instead of BaseOpenAICompat. */
export function defaultAiSdkPlugins(profile: string, opts: IgPluginsOptions = {}): IgPluginEntry[] {
  const env = opts.env ?? process.env;
  const servers = mcpServersFromEnv(env);
  const autoConnect = mcpAutoConnectFromEnv(env);
  const mapped: IgPluginEntry[] = [];
  for (const entry of defaultIgPlugins(profile, opts)) {
    if (entry.plugin.name === 'LLMProvidersPlugin') {
      mapped.push({
        plugin: AiSdkLLMProvidersPlugin,
        config: { providers: llmProvidersFromEnv(env) },
      });
      continue;
    }
    if (entry.plugin.name === 'McpBridgePlugin') {
      // Provide @ai-sdk/mcp service first; McpBridge reuses it and may auto-connect.
      mapped.push({
        plugin: AiSdkMcpPlugin,
        config: { servers, autoConnect: false, prefixToolNames: true },
      });
      mapped.push({
        plugin: entry.plugin,
        config: { servers, autoConnect },
      });
      continue;
    }
    mapped.push(entry);
  }
  return mapped;
}

export function createAiSdkBooter(opts: AiSdkBooterOptions = {}): Booter {
  const logger = opts.logger ?? ConsoleRuntimeLogger;
  const pluginsFor =
    opts.plugins ??
    ((profile: string) =>
      defaultAiSdkPlugins(profile, {
        env: opts.env,
        before: opts.before,
        after: opts.after,
      }));

  let host: IgPluginHost | undefined;

  return {
    async boot(profile: string, _startOpts: StartOptions): Promise<PluginContext> {
      host = createIgPluginHost({ logger });
      try {
        await host.apply(pluginsFor(profile));
        await host.ctx.inject(UserProfileKey)?.export();
      } catch (err) {
        await host.dispose().catch(() => {});
        host = undefined;
        throw err;
      }
      logger.info(`AI SDK host ready (profile=${profile}, plugins=${host.applied.join(', ')})`);
      return host.ctx;
    },
    async dispose() {
      const h = host;
      host = undefined;
      await h?.dispose();
    },
  };
}
