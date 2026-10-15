import {
  createClaudeParser,
  createDshParser,
  parseClaudeLine,
  parseCodexLine,
  parseDshLine,
} from '../../../src/cli/streamParse';

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

  it('parses claude control_request can_use_tool as permission', () => {
    const ev = parseClaudeLine(
      JSON.stringify({
        type: 'control_request',
        request_id: 'req-1',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          input: { command: 'ls -la' },
        },
      }),
    );
    expect(ev[0]).toEqual({ type: 'permission', id: 'req-1', summary: 'Bash: ls -la' });
    expect(
      parseClaudeLine(
        JSON.stringify({
          type: 'control_request',
          request_id: 'x',
          request: { subtype: 'initialize' },
        }),
      ),
    ).toEqual([]);
  });

  it('parses claude tool_use start and tool_result done/error', () => {
    const start = parseClaudeLine(
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }],
        },
      }),
    );
    expect(start[0]).toMatchObject({ type: 'tool', name: 'Bash', status: 'start', detail: 'tu1' });
    const done = parseClaudeLine(
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok', is_error: false }],
        },
      }),
    );
    expect(done[0]).toMatchObject({ type: 'tool', status: 'done', detail: 'tu1' });
    const err = parseClaudeLine(
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu2', content: 'fail', is_error: true }],
        },
      }),
    );
    expect(err[0]).toMatchObject({ type: 'tool', status: 'error', detail: 'tu2' });
  });

  it('createClaudeParser pairs tool_result with tool_use name', () => {
    const p = createClaudeParser();
    const j = (o: unknown) => p(JSON.stringify(o));
    j({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'a', name: 'Read' }],
      },
    });
    expect(
      j({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'x' }] },
      })[0],
    ).toMatchObject({ name: 'Read', status: 'done' });
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

describe('createDshParser', () => {
  it('pairs tool_result with the tool_call name', () => {
    const p = createDshParser();
    const j = (o: unknown) => p(JSON.stringify(o));
    j({ type: 'tool_call', callId: 'a', tool: 'bash' });
    j({ type: 'tool_call', callId: 'b', tool: 'edit' });
    expect(j({ type: 'tool_result', callId: 'b', status: 'completed' })[0]).toMatchObject({
      name: 'edit',
      status: 'done',
    });
    expect(j({ type: 'tool_result', callId: 'a', status: 'error' })[0]).toMatchObject({
      name: 'bash',
      status: 'error',
    });
    expect(j({ type: 'tool_result', callId: 'zz', status: 'completed' })[0]).toMatchObject({
      name: 'tool',
    });
  });
});
