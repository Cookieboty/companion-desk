/**
 * 中间事件 → 下游 CLI 期望的 SSE。
 * Messages（Claude Code 原生）、Responses（Codex 原生）、Chat Completions（Codex chat 入口）。
 */
import type { NormEvent, StopReason, StreamEncoder, StreamUsage } from './events';
import { formatSse } from './sse';

function rid(prefix: string): string {
  return `${prefix}_nomi_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* --------------------------- Anthropic Messages --------------------------- */

export class MessagesEncoder implements StreamEncoder {
  private started = false;
  private closed = false;
  private nextIndex = 0;
  /** 当前打开的 content block */
  private open: { index: number; kind: 'text' | 'tool'; key?: string } | null = null;
  private toolIndex = new Map<string, number>();
  private usage: StreamUsage = {};

  constructor(private readonly fallbackModel = '') {}

  private ensureStart(id?: string, model?: string, usage?: StreamUsage): string {
    if (this.started) return '';
    this.started = true;
    if (usage) this.usage = { ...usage };
    return formatSse('message_start', {
      type: 'message_start',
      message: {
        id: id || rid('msg'),
        type: 'message',
        role: 'assistant',
        content: [],
        model: model || this.fallbackModel,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: this.usage.inputTokens ?? 0, output_tokens: 0 },
      },
    });
  }

  private closeOpen(): string {
    if (!this.open) return '';
    const s = formatSse('content_block_stop', {
      type: 'content_block_stop',
      index: this.open.index,
    });
    this.open = null;
    return s;
  }

  encode(ev: NormEvent): string {
    if (this.closed) return '';
    switch (ev.type) {
      case 'start':
        return this.ensureStart(ev.id, ev.model, ev.usage);
      case 'text': {
        let s = this.ensureStart();
        if (!this.open || this.open.kind !== 'text') {
          s += this.closeOpen();
          this.open = { index: this.nextIndex++, kind: 'text' };
          s += formatSse('content_block_start', {
            type: 'content_block_start',
            index: this.open.index,
            content_block: { type: 'text', text: '' },
          });
        }
        return (
          s +
          formatSse('content_block_delta', {
            type: 'content_block_delta',
            index: this.open.index,
            delta: { type: 'text_delta', text: ev.text },
          })
        );
      }
      case 'tool_start': {
        let s = this.ensureStart() + this.closeOpen();
        const index = this.nextIndex++;
        this.toolIndex.set(ev.key, index);
        this.open = { index, kind: 'tool', key: ev.key };
        s += formatSse('content_block_start', {
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id: ev.id, name: ev.name, input: {} },
        });
        return s;
      }
      case 'tool_args': {
        const index = this.toolIndex.get(ev.key);
        if (index === undefined) return '';
        return formatSse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: ev.delta },
        });
      }
      case 'finish': {
        this.closed = true;
        const usage = { ...this.usage, ...stripUndef(ev.usage) };
        return (
          this.ensureStart() +
          this.closeOpen() +
          formatSse('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: ev.reason, stop_sequence: null },
            usage: { output_tokens: usage.outputTokens ?? 0 },
          }) +
          formatSse('message_stop', { type: 'message_stop' })
        );
      }
      case 'error':
        this.closed = true;
        return formatSse('error', {
          type: 'error',
          error: { type: messagesErrorType(ev.errorType), message: ev.message },
        });
      default:
        return '';
    }
  }

  end(): string {
    return '';
  }
}

function messagesErrorType(t?: string): string {
  const known = [
    'invalid_request_error',
    'authentication_error',
    'permission_error',
    'not_found_error',
    'rate_limit_error',
    'api_error',
    'overloaded_error',
  ];
  return t && known.includes(t) ? t : 'api_error';
}

function stripUndef(u?: StreamUsage): StreamUsage {
  const o: StreamUsage = {};
  if (u?.inputTokens !== undefined) o.inputTokens = u.inputTokens;
  if (u?.outputTokens !== undefined) o.outputTokens = u.outputTokens;
  return o;
}

/* -------------------------------- Responses ------------------------------- */

type RespItem =
  | { type: 'message'; id: string; text: string }
  | { type: 'function_call'; id: string; call_id: string; name: string; arguments: string };

export class ResponsesEncoder implements StreamEncoder {
  private seq = 0;
  private started = false;
  private closed = false;
  private id = '';
  private model: string;
  private createdAt = Math.floor(Date.now() / 1000);
  private items: RespItem[] = [];
  private open: number | null = null;
  private toolItem = new Map<string, number>();
  private usage: StreamUsage = {};

  constructor(fallbackModel = '') {
    this.model = fallbackModel;
  }

  private emit(type: string, payload: Record<string, unknown>): string {
    return formatSse(type, { type, sequence_number: this.seq++, ...payload });
  }

  private snapshot(status: string, extra: Record<string, unknown> = {}) {
    return {
      id: this.id,
      object: 'response',
      created_at: this.createdAt,
      status,
      model: this.model,
      output:
        status === 'in_progress' ? [] : this.items.map((it) => this.itemJson(it, 'completed')),
      ...extra,
    };
  }

  private itemJson(it: RespItem, status: string): Record<string, unknown> {
    if (it.type === 'message') {
      return {
        type: 'message',
        id: it.id,
        status,
        role: 'assistant',
        content:
          status === 'in_progress' ? [] : [{ type: 'output_text', text: it.text, annotations: [] }],
      };
    }
    return {
      type: 'function_call',
      id: it.id,
      call_id: it.call_id,
      name: it.name,
      arguments: status === 'in_progress' ? '' : it.arguments,
      status,
    };
  }

  private ensureStart(id?: string, model?: string, usage?: StreamUsage): string {
    if (this.started) return '';
    this.started = true;
    this.id = id && id.startsWith('resp_') ? id : rid('resp');
    if (model) this.model = model;
    if (usage) this.usage = { ...usage };
    return (
      this.emit('response.created', { response: this.snapshot('in_progress') }) +
      this.emit('response.in_progress', { response: this.snapshot('in_progress') })
    );
  }

  private closeOpen(): string {
    if (this.open === null) return '';
    const idx = this.open;
    const it = this.items[idx];
    this.open = null;
    let s = '';
    if (it.type === 'message') {
      s += this.emit('response.output_text.done', {
        item_id: it.id,
        output_index: idx,
        content_index: 0,
        text: it.text,
      });
      s += this.emit('response.content_part.done', {
        item_id: it.id,
        output_index: idx,
        content_index: 0,
        part: { type: 'output_text', text: it.text, annotations: [] },
      });
    } else {
      s += this.emit('response.function_call_arguments.done', {
        item_id: it.id,
        output_index: idx,
        arguments: it.arguments,
      });
    }
    s += this.emit('response.output_item.done', {
      output_index: idx,
      item: this.itemJson(it, 'completed'),
    });
    return s;
  }

  encode(ev: NormEvent): string {
    if (this.closed) return '';
    switch (ev.type) {
      case 'start':
        return this.ensureStart(ev.id, ev.model, ev.usage);
      case 'text': {
        let s = this.ensureStart();
        const cur = this.open !== null ? this.items[this.open] : null;
        if (!cur || cur.type !== 'message') {
          s += this.closeOpen();
          const it: RespItem = { type: 'message', id: rid('msg'), text: '' };
          this.items.push(it);
          this.open = this.items.length - 1;
          s += this.emit('response.output_item.added', {
            output_index: this.open,
            item: this.itemJson(it, 'in_progress'),
          });
          s += this.emit('response.content_part.added', {
            item_id: it.id,
            output_index: this.open,
            content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] },
          });
        }
        const it = this.items[this.open!] as Extract<RespItem, { type: 'message' }>;
        it.text += ev.text;
        return (
          s +
          this.emit('response.output_text.delta', {
            item_id: it.id,
            output_index: this.open,
            content_index: 0,
            delta: ev.text,
          })
        );
      }
      case 'tool_start': {
        let s = this.ensureStart() + this.closeOpen();
        const it: RespItem = {
          type: 'function_call',
          id: rid('fc'),
          call_id: ev.id,
          name: ev.name,
          arguments: '',
        };
        this.items.push(it);
        this.open = this.items.length - 1;
        this.toolItem.set(ev.key, this.open);
        s += this.emit('response.output_item.added', {
          output_index: this.open,
          item: this.itemJson(it, 'in_progress'),
        });
        return s;
      }
      case 'tool_args': {
        const idx = this.toolItem.get(ev.key);
        if (idx === undefined) return '';
        const it = this.items[idx] as Extract<RespItem, { type: 'function_call' }>;
        it.arguments += ev.delta;
        return this.emit('response.function_call_arguments.delta', {
          item_id: it.id,
          output_index: idx,
          delta: ev.delta,
        });
      }
      case 'finish': {
        this.closed = true;
        const u = { ...this.usage, ...stripUndef(ev.usage) };
        const usage = {
          input_tokens: u.inputTokens ?? 0,
          output_tokens: u.outputTokens ?? 0,
          total_tokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
        };
        let s = this.ensureStart() + this.closeOpen();
        if (ev.reason === 'max_tokens') {
          s += this.emit('response.incomplete', {
            response: this.snapshot('incomplete', {
              incomplete_details: { reason: 'max_output_tokens' },
              usage,
            }),
          });
        } else {
          s += this.emit('response.completed', { response: this.snapshot('completed', { usage }) });
        }
        return s;
      }
      case 'error': {
        this.closed = true;
        return (
          this.ensureStart() +
          this.emit('response.failed', {
            response: this.snapshot('failed', {
              error: { code: ev.errorType ?? 'api_error', message: ev.message },
            }),
          })
        );
      }
      default:
        return '';
    }
  }

  end(): string {
    return '';
  }
}

/* ---------------------------- Chat Completions ---------------------------- */

function chatFinishReason(r: StopReason): string {
  switch (r) {
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

export class ChatCompletionsEncoder implements StreamEncoder {
  private started = false;
  private closed = false;
  private id = rid('chatcmpl');
  private model: string;
  private created = Math.floor(Date.now() / 1000);
  private toolIndex = new Map<string, number>();
  private usage: StreamUsage = {};

  constructor(fallbackModel = '') {
    this.model = fallbackModel;
  }

  private chunk(
    delta: Record<string, unknown>,
    finish: string | null = null,
    extra: Record<string, unknown> = {},
  ) {
    return formatSse(undefined, {
      id: this.id,
      object: 'chat.completion.chunk',
      created: this.created,
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...extra,
    });
  }

  private ensureStart(id?: string, model?: string, usage?: StreamUsage): string {
    if (this.started) return '';
    this.started = true;
    if (id) this.id = id;
    if (model) this.model = model;
    if (usage) this.usage = { ...usage };
    return this.chunk({ role: 'assistant', content: '' });
  }

  encode(ev: NormEvent): string {
    if (this.closed) return '';
    switch (ev.type) {
      case 'start':
        return this.ensureStart(ev.id, ev.model, ev.usage);
      case 'text':
        return this.ensureStart() + this.chunk({ content: ev.text });
      case 'tool_start': {
        const index = this.toolIndex.size;
        this.toolIndex.set(ev.key, index);
        return (
          this.ensureStart() +
          this.chunk({
            tool_calls: [
              { index, id: ev.id, type: 'function', function: { name: ev.name, arguments: '' } },
            ],
          })
        );
      }
      case 'tool_args': {
        const index = this.toolIndex.get(ev.key);
        if (index === undefined) return '';
        return this.chunk({ tool_calls: [{ index, function: { arguments: ev.delta } }] });
      }
      case 'finish': {
        this.closed = true;
        const u = { ...this.usage, ...stripUndef(ev.usage) };
        return (
          this.ensureStart() +
          this.chunk({}, chatFinishReason(ev.reason), {
            usage: {
              prompt_tokens: u.inputTokens ?? 0,
              completion_tokens: u.outputTokens ?? 0,
              total_tokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
            },
          }) +
          formatSse(undefined, '[DONE]')
        );
      }
      case 'error':
        this.closed = true;
        return (
          formatSse(undefined, {
            error: { message: ev.message, type: ev.errorType ?? 'api_error' },
          }) + formatSse(undefined, '[DONE]')
        );
      default:
        return '';
    }
  }

  end(): string {
    return '';
  }
}
