import { parseClaudeLine, parseCodexLine, parseDshLine } from '../../../src/cli/streamParse';

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

describe('parseDshLine', () => {
  const p = (o: unknown) => parseDshLine(JSON.stringify(o));
  it('maps session, text, final', () => {
    expect(p({ type: 'session', sessionId: 'session-1', cwd: '/w' })).toEqual([
      { type: 'done', text: '', sessionId: 'session-1' },
    ]);
    expect(p({ type: 'text', text: 'hi' })).toEqual([{ type: 'text', text: 'hi' }]);
    expect(p({ type: 'final', text: 'all' })).toEqual([{ type: 'done', text: 'all' }]);
  });
  it('maps tool calls and results', () => {
    expect(p({ type: 'tool_call', callId: 'c1', tool: 'bash', input: {} })).toEqual([
      { type: 'tool', name: 'bash', status: 'start', detail: 'c1' },
    ]);
    expect(p({ type: 'tool_result', callId: 'c1', status: 'error', result: 'x' })[0]).toMatchObject(
      { type: 'tool', status: 'error', detail: 'c1' },
    );
    expect(p({ type: 'tool_result', callId: 'c1', status: 'completed' })[0]).toMatchObject({
      status: 'done',
    });
  });
  it('maps errors and failed turns; ignores thinking and other status', () => {
    expect(p({ type: 'error', message: 'boom' })).toEqual([{ type: 'error', message: 'boom' }]);
    expect(
      p({
        type: 'status',
        phase: 'turn_end',
        reason: { kind: 'error', error: { message: 'rate limited' } },
      }),
    ).toEqual([{ type: 'error', message: 'rate limited' }]);
    expect(p({ type: 'status', phase: 'turn_end', reason: { kind: 'completed' } })).toEqual([]);
    expect(p({ type: 'thinking', text: 'hmm' })).toEqual([]);
    expect(parseDshLine('not json')).toEqual([]);
  });
});
