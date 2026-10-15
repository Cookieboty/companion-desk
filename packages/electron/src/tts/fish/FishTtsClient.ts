/**
 * Fish Audio / fish-speech HTTP client (JSON).
 * Local: POST {baseUrl}/v1/tts ; health GET {baseUrl}/v1/health
 * Cloud: POST https://api.fish.audio/v1/tts with Bearer token
 *
 * Pure fetch wrapper — injectable for unit tests. No model weights bundled.
 */

export type FishTtsFormat = 'mp3' | 'wav' | 'opus' | 'pcm';

export interface FishSynthesizeParams {
  text: string;
  /** Built-in / server-side reference id (not user-uploaded blob). */
  referenceId?: string;
  format?: FishTtsFormat;
  /** Cloud model header, e.g. s2.1-pro-free */
  cloudModel?: string;
  timeoutMs?: number;
}

export interface FishSynthesizeResult {
  audio: Buffer;
  mimeType: string;
}

export interface FishHealthResult {
  ok: boolean;
  status?: string;
  latencyMs: number;
  message: string;
}

export interface FishTtsClientOptions {
  /** fish-local | fish-cloud */
  mode: 'local' | 'cloud';
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

const MIME: Record<FishTtsFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
  pcm: 'audio/pcm',
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function mimeFor(format: FishTtsFormat, contentType: string | null): string {
  if (contentType && contentType.startsWith('audio/')) {
    return contentType.split(';')[0]!.trim();
  }
  return MIME[format] ?? 'audio/mpeg';
}

export class FishTtsClient {
  private readonly mode: 'local' | 'cloud';
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FishTtsClientOptions) {
    this.mode = opts.mode;
    this.baseUrl = trimSlash(
      opts.baseUrl || (opts.mode === 'cloud' ? 'https://api.fish.audio' : 'http://127.0.0.1:8080'),
    );
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async health(timeoutMs = 2000): Promise<FishHealthResult> {
    const started = Date.now();
    const url = `${this.baseUrl}/v1/health`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (this.mode === 'cloud' && this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      const res = await this.fetchImpl(url, { method: 'GET', headers, signal: ctrl.signal });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return {
          ok: false,
          latencyMs,
          message: `health HTTP ${res.status}`,
        };
      }
      let status = 'ok';
      try {
        const body = (await res.json()) as { status?: string };
        if (body?.status) status = String(body.status);
      } catch {
        /* some servers return empty body */
      }
      return {
        ok: status === 'ok' || res.ok,
        status,
        latencyMs,
        message: status === 'ok' || res.ok ? 'Fish TTS reachable' : `unexpected status: ${status}`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async synthesize(params: FishSynthesizeParams): Promise<FishSynthesizeResult> {
    const text = params.text?.trim();
    if (!text) throw new Error('Fish TTS: text is required');
    if (this.mode === 'cloud' && !this.apiKey) {
      throw new Error('Fish TTS cloud: apiKey is required');
    }

    const format: FishTtsFormat = params.format ?? 'mp3';
    const timeoutMs = params.timeoutMs ?? 30000;
    const url = `${this.baseUrl}/v1/tts`;
    const body: Record<string, unknown> = {
      text,
      format,
    };
    if (params.referenceId) {
      body.reference_id = params.referenceId;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.mode === 'cloud') {
      headers.Authorization = `Bearer ${this.apiKey}`;
      if (params.cloudModel) headers.model = params.cloudModel;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let detail = '';
        try {
          detail = (await res.text()).slice(0, 300);
        } catch {
          /* ignore */
        }
        throw new Error(`Fish TTS HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
      }
      const ab = await res.arrayBuffer();
      const audio = Buffer.from(ab);
      if (!audio.length) throw new Error('Fish TTS returned empty audio');
      return {
        audio,
        mimeType: mimeFor(format, res.headers.get('content-type')),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function resolveFishBaseUrl(
  provider: 'fish-local' | 'fish-cloud',
  baseUrl?: string,
): string {
  if (provider === 'fish-cloud') {
    return trimSlash(baseUrl || 'https://api.fish.audio');
  }
  return trimSlash(baseUrl || 'http://127.0.0.1:8080');
}
