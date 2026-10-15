/**
 * 把各 CLI 落盘的会话文件解析成「可见对话」（尽力而为，只取用户 / 助手文本与工具名）。
 * 纯函数、不碰文件系统，便于用真实样本做夹具测试。
 *
 * - Claude Code   ~/.claude/projects/<编码后的 cwd>/<sessionId>.jsonl
 * - Codex         ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
 * - dsh           $DSH_HOME/sessions/<编码后的 cwd>/session-<uuid>/session.v4.jsonl(.zstd)
 */
import { cleanTitle } from '../agents/parsers';

import type { HarnessTabMessage } from './types';

export const HISTORY_MAX_MESSAGES = 300;
const MAX_TEXT = 20_000;

type Json = Record<string, unknown>;

function lines(text: string): Json[] {
  const out: Json[] = [];
  for (const l of text.split('\n')) {
    const s = l.trim();
    if (!s.startsWith('{')) continue;
    try {
      const v = JSON.parse(s) as unknown;
      if (v && typeof v === 'object') out.push(v as Json);
    } catch {
      /* 被截断的首行 / 正在写入的半行 */
    }
  }
  return out;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const when = (v: unknown, fallback: number): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

/** 取内容块里的文本；返回 text 与工具名 */
function blocks(content: unknown): { text: string; tools: string[] } {
  if (typeof content === 'string') return { text: content, tools: [] };
  const text: string[] = [];
  const tools: string[] = [];
  if (Array.isArray(content)) {
    for (const c of content) {
      const o = (c ?? {}) as Json;
      const type = String(o.type ?? '');
      if ((type === 'text' || type === 'input_text' || type === 'output_text') && str(o.text))
        text.push(String(o.text));
      else if (type === 'tool_use' || type === 'tool-call' || type === 'tool_call') {
        const n = str(o.name) ?? str(o.tool);
        if (n) tools.push(n);
      }
    }
  }
  return { text: text.join('\n\n'), tools };
}

/** 注入类内容（环境 / 指令 / 命令包装）不当作对话 */
function injected(text: string): boolean {
  return (
    /^\s*<(environment_context|user_instructions|INSTRUCTIONS|skills_instructions|system-reminder|local-command-caveat|local-command-stdout)/i.test(
      text,
    ) ||
    /^\s*#\s*AGENTS\.md/i.test(text) ||
    /^\s*\[Request interrupted by user/i.test(text) ||
    /^\s*\[Your previous response had no visible output/i.test(text)
  );
}

class Builder {
  readonly out: HarnessTabMessage[] = [];
  private n = 0;
  user(text: string, at: number): void {
    const content = text.trim();
    if (!content || injected(content)) return;
    this.out.push({
      id: `hist-${this.n++}`,
      role: 'user',
      content: content.slice(0, MAX_TEXT),
      timestamp: at,
    });
  }
  /** 连续的助手片段（文本 / 工具）并成一条 */
  assistant(text: string, tools: string[], at: number): void {
    const content = text.trim();
    if (!content && !tools.length) return;
    const last = this.out[this.out.length - 1];
    if (last && last.role === 'assistant') {
      if (content)
        last.content = `${last.content ? `${last.content}\n\n` : ''}${content}`.slice(0, MAX_TEXT);
      if (tools.length) last.tools = [...(last.tools ?? []), ...tools];
      last.timestamp = at;
      return;
    }
    this.out.push({
      id: `hist-${this.n++}`,
      role: 'assistant',
      content: content.slice(0, MAX_TEXT),
      timestamp: at,
      ...(tools.length ? { tools } : {}),
    });
  }
  result(): HarnessTabMessage[] {
    return this.out.slice(-HISTORY_MAX_MESSAGES);
  }
}

export function parseClaudeTranscript(text: string, fallbackAt = 0): HarnessTabMessage[] {
  const b = new Builder();
  for (const e of lines(text)) {
    if (e.isSidechain === true) continue;
    const msg = (e.message ?? {}) as Json;
    const at = when(e.timestamp, fallbackAt);
    if (e.type === 'user') {
      if (e.isMeta === true) continue;
      const { text: t } = blocks(msg.content);
      // 只含 tool_result 的「用户」行是工具回传，不是提问
      if (t) b.user(t, at);
    } else if (e.type === 'assistant') {
      if (e.isApiErrorMessage === true) continue;
      const { text: t, tools } = blocks(msg.content);
      b.assistant(t, tools, at);
    }
  }
  return b.result();
}

export function parseCodexTranscript(text: string, fallbackAt = 0): HarnessTabMessage[] {
  const b = new Builder();
  for (const e of lines(text)) {
    if (e.type !== 'response_item') continue;
    const p = (e.payload ?? {}) as Json;
    const at = when(e.timestamp, fallbackAt);
    if (p.type === 'message') {
      const { text: t } = blocks(p.content);
      if (p.role === 'user') b.user(t, at);
      else if (p.role === 'assistant') b.assistant(t, [], at);
    } else if (
      p.type === 'function_call' ||
      p.type === 'local_shell_call' ||
      p.type === 'custom_tool_call'
    ) {
      b.assistant('', [str(p.name) ?? (p.type === 'local_shell_call' ? 'shell' : 'tool')], at);
    }
  }
  return b.result();
}

export function parseDshTranscript(text: string, fallbackAt = 0): HarnessTabMessage[] {
  const b = new Builder();
  for (const e of lines(text)) {
    const data = (e.data ?? {}) as Json;
    const at = when(e.time, fallbackAt);
    if (e.type === 'user/message') {
      const src = (data.source ?? {}) as Json;
      if (src.kind !== 'user') continue; // runtime-context 等注入内容
      b.user(blocks(data.content).text, at);
    } else if (e.type === 'assistant/message') {
      const m = (data.message ?? {}) as Json;
      const { text: t, tools } = blocks(m.content);
      b.assistant(t, tools, at);
    }
  }
  return b.result();
}

export type HistoryBackend = 'claude' | 'codex' | 'dsh';

export function parseTranscript(
  backend: HistoryBackend,
  text: string,
  fallbackAt = 0,
): HarnessTabMessage[] {
  if (backend === 'claude') return parseClaudeTranscript(text, fallbackAt);
  if (backend === 'codex') return parseCodexTranscript(text, fallbackAt);
  return parseDshTranscript(text, fallbackAt);
}

/** 标题兜底：把第一条用户消息当标题（元信息解析不到标题时用） */
export function titleFromMessages(msgs: HarnessTabMessage[]): string | undefined {
  const first = msgs.find((m) => m.role === 'user');
  return first ? cleanTitle(first.content) : undefined;
}
