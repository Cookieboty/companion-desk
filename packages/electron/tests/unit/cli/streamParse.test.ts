import { parseClaudeLine, parseCodexLine } from '../../../src/cli/streamParse';

describe('streamParse', () => {
  it('parses claude text deltas and result', () => {
    const d = parseClaudeLine(
      JSON.stringify({
        type: 'stream_event',
        event: { delta: { type: 'text_delta', text: '你好' } },
      }),
    );
    expect(d[0]).toEqual({ type: 'text-delta', text: '你好' });
    const done = parseClaudeLine(
      JSON.stringify({ type: 'result', session_id: 's1', result: '完' }),
    );
    expect(done[0]).toMatchObject({ type: 'done', sessionId: 's1', text: '完' });
  });

  it('parses codex agent_message', () => {
    const ev = parseCodexLine(
      JSON.stringify({
        type: 'item.completed',
        item: { id: '1', type: 'agent_message', text: 'ok', status: 'completed' },
      }),
    );
    expect(ev.some((e) => e.type === 'text' && e.text === 'ok')).toBe(true);
    expect(ev.some((e) => e.type === 'done')).toBe(true);
  });
});
