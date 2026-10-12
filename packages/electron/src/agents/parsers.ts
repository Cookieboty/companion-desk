/**
 * 解析各编程助手本地会话文件尾部，推断 running / completed / failed / stalled。
 * 仅读本地文件，不访问任何远端账号。
 */
export type AgentKind = 'codex' | 'claude' | 'aider' | 'cline' | 'continue' | 'cursor';
export type AgentStatus = 'running' | 'completed' | 'failed' | 'stalled' | 'idle';

export interface ParseResult {
  status: AgentStatus;
  summary?: string;
}

const TAIL = 48 * 1024;

/** 读文件尾部（大 JSONL 安全） */
export function readTail(content: string, max = TAIL): string {
  if (content.length <= max) return content;
  return content.slice(content.length - max);
}

function lastJsonlEvents(tail: string, limit = 40): Array<Record<string, unknown>> {
  const lines = tail.split('\n').filter((l) => l.trim().startsWith('{'));
  const out: Array<Record<string, unknown>> = [];
  for (const line of lines.slice(-limit)) {
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* skip truncated */
    }
  }
  return out;
}

/** Codex CLI：`codex exec --json` / `~/.codex/sessions/.../rollout-*.jsonl` */
export function parseCodexTail(tail: string): ParseResult {
  const events = lastJsonlEvents(tail);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const t = String(e.type ?? e.event ?? '');
    if (t === 'turn.failed' || t === 'error' || t === 'task_failed') {
      return { status: 'failed', summary: String(e.message ?? e.error ?? '任务失败') };
    }
    if (t === 'turn.completed' || t === 'task_complete' || t === 'agent_message') {
      const lastMsg = e.last_agent_message;
      const msg =
        typeof e.message === 'string'
          ? e.message
          : typeof lastMsg === 'string'
            ? lastMsg
            : '任务完成';
      return { status: 'completed', summary: msg.slice(0, 120) };
    }
    if (t === 'turn.started' || t === 'thread.started' || t === 'item.started') {
      return { status: 'running', summary: 'Codex 运行中' };
    }
  }
  return events.length > 0
    ? { status: 'running', summary: 'Codex 会话有更新' }
    : { status: 'idle' };
}

/** Claude Code：`~/.claude/projects/<cwd>/<id>.jsonl`；progress / result 条目 */
export function parseClaudeTail(tail: string): ParseResult {
  const events = lastJsonlEvents(tail);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const t = String(e.type ?? '');
    if (t === 'result') {
      const err = e.is_error === true || e.subtype === 'error';
      const text =
        typeof e.result === 'string'
          ? e.result
          : typeof e.error === 'string'
            ? e.error
            : err
              ? 'Claude Code 报错'
              : 'Claude Code 完成';
      return { status: err ? 'failed' : 'completed', summary: text.slice(0, 120) };
    }
    if (t === 'progress') {
      const data = (e.data ?? {}) as Record<string, unknown>;
      const sub = String(data.type ?? 'progress');
      return { status: 'running', summary: `Claude Code：${sub}` };
    }
    if (t === 'assistant' || t === 'user' || t === 'tool_use' || t === 'tool_result') {
      return { status: 'running', summary: 'Claude Code 会话进行中' };
    }
  }
  return events.length > 0 ? { status: 'running' } : { status: 'idle' };
}

/** Aider：`.aider.chat.history.md` */
export function parseAiderHistory(content: string): ParseResult {
  const tail = readTail(content, 16 * 1024);
  if (/Applied edit to /i.test(tail) || /Tokens:|Cost:/i.test(tail)) {
    return { status: 'running', summary: 'Aider 会话有更新' };
  }
  if (/^# aider chat started/im.test(tail)) {
    return { status: 'running', summary: 'Aider 会话中' };
  }
  return { status: 'idle' };
}

export function parseAiderAnalytics(tail: string): ParseResult {
  const events = lastJsonlEvents(tail);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const ev = String(e.event ?? '');
    if (ev === 'exit') return { status: 'completed', summary: 'Aider 已退出' };
    if (ev === 'message_send' || ev === 'cli session' || ev === 'launched') {
      return { status: 'running', summary: 'Aider 运行中' };
    }
  }
  return { status: 'idle' };
}

/** Cline：`job.json` 或 NDJSON */
export function parseClineJob(raw: string): ParseResult {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const st = String(j.status ?? '').toLowerCase();
    if (st === 'completed' || st === 'success' || st === 'done') {
      return { status: 'completed', summary: String(j.command ?? 'Cline 任务完成').slice(0, 120) };
    }
    if (st === 'error' || st === 'failed' || st === 'timed_out') {
      return {
        status: 'failed',
        summary: String(j.error ?? j.command ?? 'Cline 失败').slice(0, 120),
      };
    }
    if (st === 'running' || st === 'active') {
      return { status: 'running', summary: String(j.command ?? 'Cline 运行中').slice(0, 120) };
    }
  } catch {
    /* not json object */
  }
  const events = lastJsonlEvents(raw);
  for (let i = events.length - 1; i >= 0; i--) {
    const t = String(events[i].type ?? events[i].event ?? '');
    if (/error|fail/i.test(t)) return { status: 'failed' };
    if (/complete|done|result/i.test(t)) return { status: 'completed' };
    if (/start|progress|tool/i.test(t)) return { status: 'running' };
  }
  return { status: 'idle' };
}

/** Continue：`~/.continue/sessions/<id>.json` */
export function parseContinueSession(raw: string): ParseResult {
  try {
    const j = JSON.parse(raw) as { history?: unknown[]; title?: string };
    const hist = Array.isArray(j.history) ? j.history : [];
    if (!hist.length) return { status: 'idle' };
    const last = hist[hist.length - 1] as Record<string, unknown>;
    const msg = last.message as Record<string, unknown> | undefined;
    const role = String(msg?.role ?? last.role ?? '');
    if (role === 'assistant' || last.toolCallStates) {
      return { status: 'completed', summary: (j.title || 'Continue 会话').slice(0, 80) };
    }
    return { status: 'running', summary: (j.title || 'Continue 运行中').slice(0, 80) };
  } catch {
    return { status: 'idle' };
  }
}

/** Cursor agent：仅 mtime 启发式（无稳定公开 IPC） */
export function parseCursorHeuristic(
  mtimeFresh: boolean,
  ageMs: number,
  stallMs: number,
): ParseResult {
  if (!mtimeFresh) return { status: 'idle' };
  if (ageMs > stallMs) return { status: 'stalled', summary: 'Cursor 代理似乎卡住了' };
  return { status: 'running', summary: 'Cursor 代理有活动' };
}
