import { defineService } from '../types/dsh';

export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  connected: boolean;
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface McpConnection {
  serverId: string;
  disconnect(): Promise<void>;
}

export type McpEvent = 'server:up' | 'server:down';

export interface McpService {
  listServers(): McpServerInfo[];
  connect(cfg: McpServerConfig): Promise<McpConnection>;
  disconnect(id: string): Promise<void>;
  on(evt: McpEvent, fn: (info: McpServerInfo) => void): () => void;
}

export const McpKey = defineService<McpService>('ctx.mcp');
