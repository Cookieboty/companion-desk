/**
 * AiSdkMcpPlugin — provides `@ai-sdk/mcp`-backed McpService before McpBridgePlugin.
 *
 * McpBridgePlugin reuses the injected service (see SkeletonMcpService fallback).
 * When `autoConnect` / servers are set here OR on McpBridgePlugin, tools land in
 * ToolRegistry and are picked up by ChatFacade.agent → withTools → streamText.
 */
import {
  McpKey,
  definePlugin,
  type McpServerConfig,
  type PluginContext,
} from '@ig-live/bundle-ig-base';

import { AiSdkMcpService, provideAiSdkMcpService } from './mcpBridge';

export interface AiSdkMcpPluginConfig {
  servers?: McpServerConfig[];
  /** Connect listed servers during apply (default false). */
  autoConnect?: boolean;
  /** Prefix MCP tool names with `${serverId}__` (default true). */
  prefixToolNames?: boolean;
}

export const AiSdkMcpPlugin = definePlugin<AiSdkMcpPluginConfig>({
  name: 'AiSdkMcpPlugin',
  apply(ctx: PluginContext, cfg: AiSdkMcpPluginConfig) {
    const svc = provideAiSdkMcpService(ctx, {
      prefixToolNames: cfg.prefixToolNames,
    });

    if (cfg.autoConnect) {
      for (const s of cfg.servers ?? []) {
        svc
          .connect(s)
          .then(() => ctx.logger.info(`mcp auto-connected: ${s.id}`))
          .catch((err) => ctx.logger.error(`mcp auto-connect failed: ${s.id}`, err));
      }
    }

    ctx.logger.info(
      `ai-sdk mcp ready (servers configured: ${(cfg.servers ?? []).length}, autoConnect=${Boolean(cfg.autoConnect)})`,
    );
  },
  async dispose(ctx) {
    const svc = ctx.inject(McpKey);
    if (svc instanceof AiSdkMcpService) {
      await svc.dispose();
    }
  },
});
