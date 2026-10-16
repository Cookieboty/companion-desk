/**
 * 编程工具会话日志 → 用量记录（纯函数，不碰文件系统）。
 *
 * 只读各工具自己写在本机的会话日志，不登录、不抓取任何账号。
 * 每个解析器都按「一个文本块」工作（增量游标只前进到完整行）；续读需要的上下文放在 state 里。
 * 字段口径统一为：input = 未命中缓存的输入，cacheRead / cacheWrite 另计，output 含推理 token。
 */
import path from 'node:path';

import type { UsageRecord, UsageSource } from './types';

export type ParseState = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

function parseTs(v: unknown): number {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function lines(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const l of text.split('\n')) {
    const s = l.trim();
    if (!s || s[0] !== '{') continue;
    try {
      const o = JSON.parse(s) as unknown;
      const r = obj(o);
      if (r) out.push(r);
    } catch {
      /* 损坏行跳过 */
    }
  }
  return out;
}

const base = (p: unknown): string | undefined => {
  const s = str(p);
  return s ? path.basename(s.replace(/[\\/]+$/, '')) || undefined : undefined;
};

const empty = (r: Pick<UsageRecord, 'input' | 'output' | 'cacheRead' | 'cacheWrite'>): boolean =>
  !r.input && !r.output && !r.cacheRead && !r.cacheWrite;

// ---------------------------------------------------------------- Claude Code

/**
 * `~/.claude/projects/<项目>/<会话>.jsonl`：type=assistant 的行带 message.usage。
 * 同一条消息会按内容块拆成多行（usage 相同或递增）→ 以 message.id 为键，账本里取最大值合并；
 * 续接会话会把旧消息复制进新文件 → 同键自然去重。
 */
export function parseClaudeChunk(text: string): UsageRecord[] {
  const out: UsageRecord[] = [];
  for (const o of lines(text)) {
    if (o.type !== 'assistant') continue;
    const m = obj(o.message);
    const u = obj(m?.usage);
    if (!m || !u) continue;
    const model = str(m.model);
    if (!model || model === '<synthetic>') continue;
    const cc = obj(u.cache_creation);
    const cacheWrite =
      num(u.cache_creation_input_tokens) ||
      num(cc?.ephemeral_5m_input_tokens) + num(cc?.ephemeral_1h_input_tokens);
    const rec = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheWrite,
    };
    if (empty(rec)) continue;
    const id = str(m.id) ?? str(o.requestId) ?? str(o.uuid);
    if (!id) continue;
    const session = str(o.sessionId);
    // Anthropic 的消息 id（msg_…）全局唯一；其它网关的 id 可能撞（chatcmpl-12），要带上会话
    const key = id.startsWith('msg_') || !session ? `claude:${id}` : `claude:${session}:${id}`;
    out.push({
      key,
      ts: parseTs(o.timestamp),
      source: 'claude',
      via: 'log',
      model,
      ...rec,
      session,
      project: base(o.cwd),
    });
  }
  return out;
}

// ---------------------------------------------------------------- Codex

/**
 * `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`：
 * session_meta 给会话 id / cwd，turn_context 给模型，event_msg(token_count) 给每次请求的用量。
 * token_count 会因为额度信息刷新而重复出现 → 用累计 total_tokens 去重（只在增长时记一条）。
 * input_tokens 含缓存命中，这里拆成「未命中 + 缓存读」。
 */
export function parseCodexChunk(text: string, state: ParseState): UsageRecord[] {
  const out: UsageRecord[] = [];
  for (const o of lines(text)) {
    const p = obj(o.payload);
    if (o.type === 'session_meta' && p) {
      state.sid = str(p.session_id) ?? str(p.id) ?? state.sid;
      state.cwd = str(p.cwd) ?? state.cwd;
      state.provider = str(p.model_provider) ?? state.provider;
    } else if (o.type === 'turn_context' && p) {
      state.model = str(p.model) ?? state.model;
      state.cwd = str(p.cwd) ?? state.cwd;
    } else if (o.type === 'event_msg' && p?.type === 'token_count') {
      const info = obj(p.info);
      const last = obj(info?.last_token_usage);
      const total = obj(info?.total_token_usage);
      if (!last) continue;
      const cum = num(total?.total_tokens);
      if (cum && cum === state.lastTotal) continue;
      if (cum) state.lastTotal = cum;
      const cached = num(last.cached_input_tokens);
      const write = num(last.cache_write_input_tokens);
      const rec = {
        input: Math.max(0, num(last.input_tokens) - cached - write),
        output: num(last.output_tokens),
        cacheRead: cached,
        cacheWrite: write,
      };
      if (empty(rec)) continue;
      const sid = (state.sid as string | undefined) ?? 'unknown';
      out.push({
        key: `codex:${sid}:${cum || parseTs(o.timestamp)}`,
        ts: parseTs(o.timestamp),
        source: 'codex',
        via: 'log',
        provider: state.provider as string | undefined,
        model: (state.model as string | undefined) ?? 'unknown',
        ...rec,
        session: sid === 'unknown' ? undefined : sid,
        project: base(state.cwd),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- dsh

/**
 * `$DSH_HOME/sessions/<cwd>/session-<uuid>/session.v4.jsonl(.zstd)`：
 * request/context 给 provider / 模型，assistant/message 的 data.usage 给用量；以 seq 为键。
 * 输入口径同 AI SDK：inputTokens 含缓存读。
 */
export function parseDshChunk(text: string, state: ParseState): UsageRecord[] {
  const out: UsageRecord[] = [];
  for (const o of lines(text)) {
    const d = obj(o.data);
    if (o.type === 'session') {
      state.sid = str(o.id) ?? state.sid;
      state.cwd = str(o.cwd) ?? state.cwd;
    } else if (o.type === 'request/context' && d) {
      state.model = str(d.model) ?? state.model;
      state.provider = str(d.provider) ?? state.provider;
    } else if (o.type === 'assistant/message' && d) {
      const u = obj(d.usage);
      if (!u) continue;
      const cacheRead = num(u.cacheReadTokens);
      const cacheWrite = num(u.cacheWriteTokens);
      const rec = {
        input: Math.max(0, num(u.inputTokens) - cacheRead - cacheWrite),
        output: num(u.outputTokens),
        cacheRead,
        cacheWrite,
      };
      if (empty(rec)) continue;
      const sid = (state.sid as string | undefined) ?? 'unknown';
      out.push({
        key: `dsh:${sid}:${num(o.seq) || parseTs(o.time)}`,
        ts: parseTs(o.time),
        source: 'dsh',
        via: 'log',
        provider: state.provider as string | undefined,
        model: (state.model as string | undefined) ?? 'unknown',
        ...rec,
        session: sid === 'unknown' ? undefined : sid,
        project: base(state.cwd),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Gemini CLI

/**
 * `~/.gemini/tmp/<hash>/chats/session-*.json`：整份 JSON，type=gemini 的消息带 tokens。
 * 尽力解析：input 按 Gemini API 口径视为含缓存读；output 含 thoughts。
 */
export function parseGeminiFile(text: string, fallbackCwd?: string): UsageRecord[] {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  const root = obj(j);
  const msgs = Array.isArray(root?.messages) ? (root!.messages as unknown[]) : [];
  const sid = str(root?.sessionId) ?? 'unknown';
  const out: UsageRecord[] = [];
  msgs.forEach((raw, i) => {
    const m = obj(raw);
    const t = obj(m?.tokens);
    if (!m || !t || (m.type !== 'gemini' && m.type !== 'model')) return;
    const cached = num(t.cached);
    const rec = {
      input: Math.max(0, num(t.input) - cached),
      output: num(t.output) + num(t.thoughts),
      cacheRead: cached,
      cacheWrite: 0,
    };
    if (empty(rec)) return;
    out.push({
      key: `gemini:${sid}:${str(m.id) ?? i}`,
      ts: parseTs(m.timestamp) || parseTs(root?.lastUpdated),
      source: 'gemini',
      via: 'log',
      model: str(m.model) ?? 'unknown',
      ...rec,
      session: sid === 'unknown' ? undefined : sid,
      project: base(fallbackCwd),
    });
  });
  return out;
}

// ---------------------------------------------------------------- Aider

/** `~/.aider/analytics.jsonl`：event=message_send 的 properties 带 prompt / completion tokens（尽力解析）。 */
export function parseAiderChunk(text: string): UsageRecord[] {
  const out: UsageRecord[] = [];
  for (const o of lines(text)) {
    if (o.event !== 'message_send') continue;
    const p = obj(o.properties);
    if (!p) continue;
    const rec = {
      input: num(p.prompt_tokens),
      output: num(p.completion_tokens),
      cacheRead: 0,
      cacheWrite: 0,
    };
    if (empty(rec)) continue;
    const ts = parseTs(o.time);
    out.push({
      key: `aider:${ts}:${rec.input}:${rec.output}`,
      ts,
      source: 'aider',
      via: 'log',
      model: str(p.main_model) ?? 'unknown',
      ...rec,
    });
  }
  return out;
}

export const LOG_SOURCES: UsageSource[] = ['claude', 'codex', 'dsh', 'gemini', 'aider'];
