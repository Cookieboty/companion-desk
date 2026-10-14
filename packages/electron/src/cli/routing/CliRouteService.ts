/**
 * 本地路由：把 Claude Code / Codex 的原生请求转到真实上游，并按档案 apiFormat 做协议转换。
 * 默认监听 127.0.0.1:18721（仅本机）。
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { ipcMain } from 'electron';

import {
  type ClaudeApiFormat,
  type CodexApiFormat,
  type CliApiFormat,
  formatNeedsRouting,
} from '../formats';

import {
  createStreamConverter,
  jsonToJson,
  jsonToSse,
  type DownstreamStreamFormat,
  type UpstreamStreamFormat,
} from './stream';
import {
  chatCompletionsResponseToMessages,
  chatCompletionsResponseToResponses,
  geminiResponseToMessages,
  messagesResponseToChatCompletions,
  messagesResponseToResponses,
  messagesToChatCompletions,
  messagesToGemini,
  messagesToResponses,
  responsesResponseToMessages,
  responsesToChatCompletions,
  responsesToMessages,
  chatCompletionsToMessages,
} from './transforms';

/** 流式转换方向；null 表示上游与下游同协议，原样透传字节 */
export type StreamPlan = { from: UpstreamStreamFormat; to: DownstreamStreamFormat } | null;

export interface RouteSettings {
  /** 总开关 */
  enabled: boolean;
  host: string;
  port: number;
  /** 接管 Claude Code → 写本地地址 */
  claude: boolean;
  /** 接管 Codex → 写本地地址 */
  codex: boolean;
}

export interface RouteUpstream {
  kind: 'claude' | 'codex';
  baseUrl: string;
  apiKey: string;
  model: string;
  apiFormat: CliApiFormat;
}

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

const DEFAULTS: RouteSettings = {
  enabled: false,
  host: '127.0.0.1',
  port: 18721,
  claude: false,
  codex: false,
};

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

/** 同协议时 JSON→SSE 回退所用的方向 */
function nativeStreamPlan(
  kind: 'claude' | 'codex',
  url: string,
): { from: UpstreamStreamFormat; to: DownstreamStreamFormat } {
  if (kind === 'claude') return { from: 'messages', to: 'messages' };
  return url.includes('chat/completions')
    ? { from: 'chat', to: 'chat' }
    : { from: 'responses', to: 'responses' };
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

function joinUrl(base: string, p: string): string {
  const b = trimSlash(base);
  if (/^https?:\/\//i.test(p)) return p;
  return `${b}${p.startsWith('/') ? p : `/${p}`}`;
}

export class CliRouteService {
  private settings: RouteSettings;
  private server: http.Server | null = null;
  private readonly settingsPath: string;
  private resolveUpstream: (kind: 'claude' | 'codex') => RouteUpstream | null;

  constructor(
    private readonly d: {
      root: string;
      logger: Logger;
      resolveUpstream: (kind: 'claude' | 'codex') => RouteUpstream | null;
    },
  ) {
    this.settingsPath = path.join(d.root, 'routing.json');
    this.resolveUpstream = d.resolveUpstream;
    this.settings = this.load();
  }

  private load(): RouteSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')) as Partial<RouteSettings>;
      return { ...DEFAULTS, ...raw };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
  }

  getSettings(): RouteSettings & { listening: boolean; listenUrl: string | null } {
    return {
      ...this.settings,
      listening: Boolean(this.server?.listening),
      listenUrl: this.listenUrl(),
    };
  }

  listenUrl(): string | null {
    if (!this.server?.listening) return null;
    return `http://${this.settings.host}:${this.settings.port}`;
  }

  /** CLI 配置应写入的 base（含 /v1 视应用而定） */
  cliBaseUrl(kind: 'claude' | 'codex'): string | null {
    if (!this.settings.enabled || !this.settings[kind]) return null;
    const base = `http://${this.settings.host}:${this.settings.port}`;
    return kind === 'codex' ? `${base}/v1` : base;
  }

  setSettings(
    patch: Partial<RouteSettings>,
  ): RouteSettings & { listening: boolean; listenUrl: string | null } {
    this.settings = {
      ...this.settings,
      ...patch,
      host: typeof patch.host === 'string' && patch.host ? patch.host : this.settings.host,
      port:
        typeof patch.port === 'number' && patch.port > 0 && patch.port < 65536
          ? Math.floor(patch.port)
          : this.settings.port,
    };
    this.save();
    if (this.settings.enabled) {
      void this.start().catch((e) => this.d.logger.warn('route start failed', e));
    } else {
      this.stop();
    }
    return this.getSettings();
  }

  async start(): Promise<void> {
    if (this.server?.listening) return;
    this.stop();
    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.settings.port, this.settings.host, () => resolve());
    });
    this.d.logger.info('cli route listening', this.listenUrl());
  }

  stop(): void {
    if (!this.server) return;
    try {
      this.server.close();
    } catch {
      /* */
    }
    this.server = null;
  }

  private detectKind(req: http.IncomingMessage, url: string): 'claude' | 'codex' | null {
    // Codex 走 /v1/responses 或 /v1/chat/completions；Claude 走 /v1/messages 或 /messages
    if (url.includes('/responses') || url.includes('/chat/completions')) return 'codex';
    if (url.includes('/messages') || url.includes('/v1/messages')) return 'claude';
    // Gemini path used when Claude upstream is gemini
    if (url.includes(':generateContent') || url.includes('/models/')) return 'claude';
    const via = String(req.headers['x-nomi-cli'] ?? '');
    if (via === 'claude' || via === 'codex') return via;
    return null;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
        sendJson(res, 200, { ok: true, service: 'nomi-cli-route', settings: this.getSettings() });
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' });
        return;
      }
      const url = req.url ?? '/';
      const kind = this.detectKind(req, url);
      if (!kind) {
        sendJson(res, 404, { error: 'unknown route path' });
        return;
      }
      if (!this.settings.enabled || !this.settings[kind]) {
        sendJson(res, 503, { error: `routing disabled for ${kind}` });
        return;
      }
      const up = this.resolveUpstream(kind);
      if (!up) {
        sendJson(res, 502, { error: `no active ${kind} provider` });
        return;
      }
      if (formatNeedsRouting(kind, up.apiFormat) === false && kind === 'claude') {
        // native passthrough still ok via route
      }
      const body = await readJson(req);
      const wantsStream =
        Boolean(body) && typeof body === 'object' && (body as { stream?: unknown }).stream === true;
      const { upstreamUrl, requestBody, responseTransform, stream } = this.plan(
        kind,
        up,
        url,
        body,
        wantsStream,
      );
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: wantsStream ? 'text/event-stream' : 'application/json',
      };
      if (up.apiKey) {
        if (up.apiFormat === 'anthropic_messages' && kind === 'codex') {
          headers['x-api-key'] = up.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else if (up.apiFormat === 'gemini_generate_content') {
          // Gemini 原生 API 使用 x-goog-api-key 鉴权
          headers['x-goog-api-key'] = up.apiKey;
        } else if (kind === 'claude' && up.apiFormat === 'anthropic_messages') {
          headers['x-api-key'] = up.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers.Authorization = `Bearer ${up.apiKey}`;
        }
      }
      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) abort.abort();
      });
      const upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: abort.signal,
      });
      const isSse = (upstreamRes.headers.get('content-type') ?? '').includes('text/event-stream');
      if (wantsStream && upstreamRes.ok && isSse && upstreamRes.body) {
        await this.pipeStream(upstreamRes.body, res, stream, up.model);
        return;
      }
      const text = await upstreamRes.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep text */
      }
      if (!upstreamRes.ok) {
        res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
        res.end(typeof parsed === 'string' ? text : JSON.stringify(parsed));
        return;
      }
      if (wantsStream && parsed && typeof parsed === 'object') {
        // 客户端要流式、上游却回了普通 JSON：合成目标协议的完整 SSE
        const plan = stream ?? nativeStreamPlan(kind, url);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(jsonToSse(plan.from, plan.to, parsed, { model: up.model }));
        return;
      }
      if (stream) {
        // 跨协议非流式：经中间事件重建目标 JSON，保留工具调用、停止原因与用量
        const r = jsonToJson(stream.from, stream.to, parsed, { model: up.model });
        sendJson(res, r.status, r.body);
        return;
      }
      sendJson(res, 200, responseTransform(parsed));
    } catch (e) {
      this.d.logger.warn('cli route error', e);
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** 上游 SSE → 下游 SSE：按需逐片做协议转换，并在上游中断时补发错误事件 */
  private async pipeStream(
    body: ReadableStream<Uint8Array>,
    res: http.ServerResponse,
    stream: StreamPlan,
    model: string,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const conv = stream ? createStreamConverter(stream.from, stream.to, { model }) : null;
    const decoder = new TextDecoder();
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (res.destroyed) return;
        if (!conv) {
          res.write(Buffer.from(value));
          continue;
        }
        const outChunk = conv.push(decoder.decode(value, { stream: true }));
        if (outChunk) res.write(outChunk);
      }
      if (conv) {
        const tail = conv.push(decoder.decode()) + conv.end();
        if (tail) res.write(tail);
      }
    } catch (e) {
      if (res.destroyed) return;
      this.d.logger.warn('cli route stream interrupted', e);
      if (conv) res.write(conv.fail(e instanceof Error ? e.message : String(e)));
    } finally {
      reader.releaseLock();
      if (!res.destroyed) res.end();
    }
  }

  private plan(
    kind: 'claude' | 'codex',
    up: RouteUpstream,
    reqUrl: string,
    body: unknown,
    wantsStream = false,
  ): {
    upstreamUrl: string;
    requestBody: unknown;
    responseTransform: (u: unknown) => unknown;
    stream: StreamPlan;
  } {
    const base = trimSlash(up.baseUrl);
    /** Chat Completions 流默认不带 usage，显式请求 */
    const withChatUsage = (b: unknown): unknown =>
      wantsStream && b && typeof b === 'object'
        ? { ...(b as object), stream: true, stream_options: { include_usage: true } }
        : b;
    if (kind === 'claude') {
      const fmt = up.apiFormat as ClaudeApiFormat;
      if (fmt === 'anthropic_messages') {
        return {
          upstreamUrl: joinUrl(base.includes('/v1') ? base : `${base}/v1`, '/messages'),
          requestBody: body,
          responseTransform: (u) => u,
          stream: null,
        };
      }
      if (fmt === 'openai_chat_completions') {
        return {
          upstreamUrl: joinUrl(base, '/chat/completions'),
          requestBody: withChatUsage(messagesToChatCompletions(body, up.model)),
          responseTransform: chatCompletionsResponseToMessages,
          stream: { from: 'chat', to: 'messages' },
        };
      }
      if (fmt === 'openai_responses') {
        return {
          upstreamUrl: joinUrl(base, '/responses'),
          requestBody: messagesToResponses(body, up.model),
          responseTransform: responsesResponseToMessages,
          stream: { from: 'responses', to: 'messages' },
        };
      }
      // gemini
      const model = (up.model || 'gemini-pro').replace(/^models\//, '');
      // 仅填域名时补上 API 版本段
      const gBase = /\/v1(beta|alpha)?\d*(\/|$)/.test(base) ? base : `${base}/v1beta`;
      return {
        upstreamUrl: wantsStream
          ? joinUrl(gBase, `/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`)
          : joinUrl(gBase, `/models/${encodeURIComponent(model)}:generateContent`),
        requestBody: messagesToGemini(body),
        responseTransform: geminiResponseToMessages,
        stream: { from: 'gemini', to: 'messages' },
      };
    }
    // codex
    const fmt = up.apiFormat as CodexApiFormat;
    if (fmt === 'openai_responses') {
      return {
        upstreamUrl: joinUrl(base, '/responses'),
        requestBody: body,
        responseTransform: (u) => u,
        stream: null,
      };
    }
    if (fmt === 'openai_chat_completions') {
      // Codex 原生发 responses；若请求已是 chat 则透传转换路径
      const isChat = reqUrl.includes('chat/completions');
      return {
        upstreamUrl: joinUrl(base, '/chat/completions'),
        requestBody: isChat ? body : withChatUsage(responsesToChatCompletions(body, up.model)),
        responseTransform: isChat ? (u) => u : chatCompletionsResponseToResponses,
        stream: isChat ? null : { from: 'chat', to: 'responses' },
      };
    }
    // anthropic_messages
    return {
      upstreamUrl: joinUrl(base.includes('/v1') ? base : `${base}/v1`, '/messages'),
      requestBody: reqUrl.includes('chat/completions')
        ? chatCompletionsToMessages(body, up.model)
        : responsesToMessages(body, up.model),
      responseTransform: reqUrl.includes('chat/completions')
        ? messagesResponseToChatCompletions
        : messagesResponseToResponses,
      stream: reqUrl.includes('chat/completions')
        ? { from: 'messages', to: 'chat' }
        : { from: 'messages', to: 'responses' },
    };
  }

  address(): AddressInfo | null {
    const a = this.server?.address();
    return a && typeof a === 'object' ? a : null;
  }

  registerIpc(): void {
    const handle = (ch: string, fn: (...a: unknown[]) => unknown) => {
      ipcMain.removeHandler(ch);
      ipcMain.handle(ch, async (_e, ...a) => {
        try {
          return await fn(...a);
        } catch (err) {
          return { __error: { message: err instanceof Error ? err.message : String(err) } };
        }
      });
    };
    handle('ai:cli-route:state', () => this.getSettings());
    handle('ai:cli-route:set', (p) => this.setSettings((p ?? {}) as Partial<RouteSettings>));
    handle('ai:cli-route:start', () => this.start().then(() => this.getSettings()));
    handle('ai:cli-route:stop', () => {
      this.stop();
      return this.getSettings();
    });
  }
}

let inst: CliRouteService | null = null;
export function initCliRouteService(
  d: ConstructorParameters<typeof CliRouteService>[0],
): CliRouteService {
  inst = new CliRouteService(d);
  return inst;
}
export function getCliRouteService(): CliRouteService | null {
  return inst;
}
