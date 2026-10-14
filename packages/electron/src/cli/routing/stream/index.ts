/**
 * 流式协议转换入口：上游 SSE 文本分片 → 下游 SSE 文本。
 */
import {
  ChatCompletionsDecoder,
  GeminiDecoder,
  MessagesDecoder,
  ResponsesDecoder,
} from './decoders';
import { ChatCompletionsEncoder, MessagesEncoder, ResponsesEncoder } from './encoders';
import type { StreamDecoder, StreamEncoder } from './events';
import { SseParser } from './sse';

export type UpstreamStreamFormat = 'chat' | 'responses' | 'gemini' | 'messages';
export type DownstreamStreamFormat = 'messages' | 'responses' | 'chat';

export interface StreamConverter {
  push(chunk: string): string;
  /** 上游正常结束 */
  end(): string;
  /** 上游中途失败（网络中断等）→ 下游错误事件 */
  fail(message: string): string;
}

function makeDecoder(f: UpstreamStreamFormat): StreamDecoder {
  switch (f) {
    case 'chat':
      return new ChatCompletionsDecoder();
    case 'responses':
      return new ResponsesDecoder();
    case 'gemini':
      return new GeminiDecoder();
    case 'messages':
      return new MessagesDecoder();
  }
}

function makeEncoder(f: DownstreamStreamFormat, model: string): StreamEncoder {
  switch (f) {
    case 'messages':
      return new MessagesEncoder(model);
    case 'responses':
      return new ResponsesEncoder(model);
    case 'chat':
      return new ChatCompletionsEncoder(model);
  }
}

export function createStreamConverter(
  from: UpstreamStreamFormat,
  to: DownstreamStreamFormat,
  opts: { model?: string } = {},
): StreamConverter {
  const parser = new SseParser();
  const dec = makeDecoder(from);
  const enc = makeEncoder(to, opts.model ?? '');
  return {
    push(chunk) {
      let s = '';
      for (const ev of parser.push(chunk)) for (const n of dec.push(ev)) s += enc.encode(n);
      return s;
    },
    end() {
      let s = '';
      for (const ev of parser.end()) for (const n of dec.push(ev)) s += enc.encode(n);
      for (const n of dec.end()) s += enc.encode(n);
      return s + enc.end();
    },
    fail(message) {
      return enc.encode({ type: 'error', message, errorType: 'api_error' }) + enc.end();
    },
  };
}

export { SseParser, formatSse } from './sse';
export type { NormEvent, StopReason } from './events';
