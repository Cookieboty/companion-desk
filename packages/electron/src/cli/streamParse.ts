/** 解析 Claude stream-json / Codex NDJSON 行 → HarnessEvent */
import { t } from '../i18n';

import type { HarnessEvent } from './types';

export function parseClaudeLine(line: string): HarnessEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return [];
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  const type = String(j.type ?? '');
  const out: HarnessEvent[] = [];
  if (type === 'stream_event') {
    const ev = j.event as { delta?: { type?: string; text?: string } } | undefined;
    if (ev?.delta?.type === 'text_delta' && ev.delta.text) {
      out.push({ type: 'text-delta', text: ev.delta.text });
    }
  } else if (type === 'assistant') {
    const msg = j.message as { content?: unknown } | undefined;
    const text = extractClaudeText(msg?.content);
    if (text) out.push({ type: 'text', text });
  } else if (type === 'result') {
    const text = typeof j.result === 'string' ? j.result : '';
    const sid = typeof j.session_id === 'string' ? j.session_id : undefined;
    out.push({ type: 'done', text, sessionId: sid });
  } else if (type === 'error' || (type === 'system' && j.subtype === 'error')) {
    out.push({ type: 'error', message: String(j.error ?? j.message ?? t('Claude 错误')) });
  } else if (type === 'control_request') {
    const reqId = typeof j.request_id === 'string' ? j.request_id : '';
    const req = (j.request ?? {}) as Record<string, unknown>;
    if (reqId && req.subtype === 'can_use_tool') {
      const tool = String(req.tool_name ?? 'tool');
      const input = req.input;
      let detail = '';
      if (input && typeof input === 'object') {
        const o = input as Record<string, unknown>;
        detail = String(o.command ?? o.file_path ?? o.path ?? '').slice(0, 120);
      } else if (typeof input === 'string') {
        detail = input.slice(0, 120);
      }
      out.push({
        type: 'permission',
        id: reqId,
        summary: detail ? `${tool}: ${detail}` : tool,
      });
    }
  }
  // tool_use / tool_result blocks
  if (type === 'assistant' || type === 'user') {
    const msg = j.message as { content?: unknown } | undefined;
    if (Array.isArray(msg?.content)) {
      for (const c of msg.content as Array<Record<string, unknown>>) {
        if (type === 'assistant' && c.type === 'tool_use') {
          out.push({
            type: 'tool',
            name: String(c.name ?? 'tool'),
            status: 'start',
            detail: typeof c.id === 'string' ? c.id : undefined,
          });
        }
        if (type === 'user' && c.type === 'tool_result') {
          const id = typeof c.tool_use_id === 'string' ? c.tool_use_id : undefined;
          const err = c.is_error === true || c.is_error === 'true';
          out.push({
            type: 'tool',
            name: 'tool',
            status: err ? 'error' : 'done',
            detail: id,
          });
        }
      }
    }
  }
  return out;
}

/**
 * 有状态的 Claude 解析器：用先前 tool_use 的 id 给 tool_result 补回工具名。
 * 每次运行新建一个。
 */
export function createClaudeParser(): (line: string) => HarnessEvent[] {
  const names = new Map<string, string>();
  return (line) =>
    parseClaudeLine(line).map((ev) => {
      if (ev.type !== 'tool' || !ev.detail) return ev;
      if (ev.status === 'start') {
        names.set(ev.detail, ev.name);
        return ev;
      }
      const name = names.get(ev.detail);
      if (name) names.delete(ev.detail);
      return name ? { ...ev, name } : ev;
    });
}

function extractClaudeText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (c && typeof c === 'object' && (c as { type?: string }).type === 'text') {
        return String((c as { text?: string }).text ?? '');
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

export function parseCodexLine(line: string): HarnessEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return [];
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  const type = String(j.type ?? '');
  const out: HarnessEvent[] = [];
  if (type === 'item.completed' || type === 'item.started') {
    const item = j.item as
      { type?: string; text?: string; command?: string; status?: string } | undefined;
    if (!item) return out;
    if (item.type === 'agent_message' && item.text) {
      out.push({ type: 'text', text: item.text });
      if (type === 'item.completed') out.push({ type: 'done', text: item.text });
    }
    if (item.type === 'command_execution') {
      out.push({
        type: 'tool',
        name: 'bash',
        status: type === 'item.completed' ? 'done' : 'start',
        detail: item.command,
      });
    }
  } else if (type === 'turn.failed' || type === 'error') {
    out.push({ type: 'error', message: String(j.error ?? j.message ?? t('Codex 错误')) });
  } else if (type === 'thread.started' && typeof j.thread_id === 'string') {
    out.push({ type: 'done', text: '', sessionId: j.thread_id });
  }
  return out;
}

/**
 * dsh `--profile headless --json` 的 NDJSON 事件：
 * session / status / text / thinking / tool_call / tool_result / final / error。
 * 文本按已提交的步骤整段到达；final 为整轮最终回复。
 */
export function parseDshLine(line: string): HarnessEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return [];
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  const type = String(j.type ?? '');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (type) {
    case 'session':
      return str(j.sessionId) ? [{ type: 'done', text: '', sessionId: str(j.sessionId) }] : [];
    case 'text':
      return str(j.text) ? [{ type: 'text', text: str(j.text) }] : [];
    case 'final':
      return [{ type: 'done', text: str(j.text) }];
    case 'tool_call':
      return [
        { type: 'tool', name: str(j.tool) || 'tool', status: 'start', detail: str(j.callId) },
      ];
    case 'tool_result':
      return [
        {
          type: 'tool',
          name: str(j.tool) || 'tool',
          status: j.status === 'error' ? 'error' : 'done',
          detail: str(j.callId),
        },
      ];
    case 'error':
      return [{ type: 'error', message: str(j.message) || t('dsh 错误') }];
    case 'status': {
      const reason = j.reason as { kind?: string; error?: { message?: string } } | undefined;
      if (j.phase === 'turn_end' && reason?.kind === 'error') {
        return [{ type: 'error', message: reason.error?.message || t('dsh 错误') }];
      }
      return [];
    }
    default:
      return [];
  }
}

/**
 * 有状态的 dsh 解析器：tool_result 只带 callId，按先前的 tool_call 补回工具名。
 * 每次运行新建一个。
 */
export function createDshParser(): (line: string) => HarnessEvent[] {
  const names = new Map<string, string>();
  return (line) =>
    parseDshLine(line).map((ev) => {
      if (ev.type !== 'tool' || !ev.detail) return ev;
      if (ev.status === 'start') {
        names.set(ev.detail, ev.name);
        return ev;
      }
      const name = names.get(ev.detail);
      if (name) names.delete(ev.detail);
      return name ? { ...ev, name } : ev;
    });
}
