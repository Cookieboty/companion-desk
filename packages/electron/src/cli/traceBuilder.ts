/** 把一轮的 HarnessEvent 整理成可持久化的轨迹（工具调用 + 思考），控制体积 */
import type { HarnessEvent, HarnessTraceEvent } from './types';

export const MAX_TRACE_EVENTS = 300;
export const MAX_TRACE_BYTES = 400_000;

export function isTraceEvent(ev: HarnessEvent): ev is HarnessTraceEvent {
  return ev.type === 'tool' || ev.type === 'thinking';
}

/** 给 tool / thinking 事件打上主进程时间戳（会话视图据此算耗时） */
export function stampEvent(ev: HarnessEvent, now = Date.now()): HarnessEvent {
  if (isTraceEvent(ev) && ev.at === undefined) ev.at = now;
  return ev;
}

export function buildTrace(events: HarnessEvent[]): HarnessTraceEvent[] {
  const out: HarnessTraceEvent[] = [];
  for (const ev of events) {
    if (!isTraceEvent(ev)) continue;
    const prev = out[out.length - 1];
    // 连续的思考片段合并
    if (ev.type === 'thinking' && prev?.type === 'thinking') {
      out[out.length - 1] = { ...prev, text: `${prev.text}${ev.text}`.slice(0, 8000) };
      continue;
    }
    out.push({ ...ev });
  }
  const trimmed = out.length > MAX_TRACE_EVENTS ? out.slice(-MAX_TRACE_EVENTS) : out;
  // 体积超限：从最早的事件起丢掉输出 / 参数
  let size = JSON.stringify(trimmed).length;
  for (let i = 0; i < trimmed.length && size > MAX_TRACE_BYTES; i++) {
    const ev = trimmed[i]!;
    if (ev.type !== 'tool') continue;
    if (ev.output) {
      size -= ev.output.length;
      delete ev.output;
    }
    if (size > MAX_TRACE_BYTES && ev.input) {
      size -= ev.input.length;
      delete ev.input;
    }
  }
  return trimmed;
}
