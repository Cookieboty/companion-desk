jest.unmock('fs');
jest.unmock('path');
jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
  Notification: Object.assign(
    jest.fn(() => ({ show: jest.fn() })),
    {
      isSupported: () => false,
    },
  ),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AgentProgressService, sanitizeAgentWatch } from '../../../src/agents/AgentProgressService';
import {
  parseAiderAnalytics,
  parseClaudeTail,
  parseClineJob,
  parseCodexTail,
  parseContinueSession,
} from '../../../src/agents/parsers';

describe('parsers', () => {
  it('codex turn.completed / failed', () => {
    expect(
      parseCodexTail('{"type":"turn.started"}\n{"type":"turn.completed","message":"done"}\n'),
    ).toEqual({ status: 'completed', summary: 'done' });
    expect(parseCodexTail('{"type":"error","message":"boom"}\n')).toEqual({
      status: 'failed',
      summary: 'boom',
    });
  });

  it('claude result / progress', () => {
    expect(parseClaudeTail('{"type":"progress","data":{"type":"bash_progress"}}\n')).toEqual({
      status: 'running',
      summary: 'Claude Code：bash_progress',
    });
    expect(parseClaudeTail('{"type":"result","result":"ok"}\n')).toEqual({
      status: 'completed',
      summary: 'ok',
    });
    expect(parseClaudeTail('{"type":"result","is_error":true,"error":"x"}\n')).toEqual({
      status: 'failed',
      summary: 'x',
    });
  });

  it('aider analytics / cline / continue', () => {
    expect(parseAiderAnalytics('{"event":"message_send","time":1}\n')).toEqual({
      status: 'running',
      summary: 'Aider 运行中',
    });
    expect(parseClineJob(JSON.stringify({ status: 'running', command: 'npm test' }))).toEqual({
      status: 'running',
      summary: 'npm test',
    });
    expect(
      parseContinueSession(
        JSON.stringify({ title: 't', history: [{ message: { role: 'assistant' } }] }),
      ),
    ).toEqual({ status: 'completed', summary: 't' });
  });
});

describe('AgentProgressService', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cd-agents-'));
  const say = jest.fn();

  it('sanitize + detect + remind on transition', () => {
    const home = tmp();
    const root = tmp();
    const sessions = path.join(home, '.codex', 'sessions', '2026', '10', '12');
    fs.mkdirSync(sessions, { recursive: true });
    const file = path.join(sessions, 'rollout-1.jsonl');
    fs.writeFileSync(file, '{"type":"turn.started"}\n');

    let now = 1_000_000;
    const svc = new AgentProgressService({
      root,
      home,
      logger: { info: jest.fn(), warn: jest.fn() },
      desktop: { say } as never,
      now: () => now,
      pollMs: 60_000,
    });
    expect(svc.detectKinds()).toContain('codex');
    svc.tick();
    expect(svc.state().sessions.some((s) => s.kind === 'codex' && s.status === 'running')).toBe(
      true,
    );
    expect(say).toHaveBeenCalled();

    say.mockClear();
    fs.writeFileSync(file, '{"type":"turn.started"}\n{"type":"turn.completed","message":"好了"}\n');
    now += 1000;
    // bump mtime
    const st = fs.statSync(file);
    fs.utimesSync(file, st.atime, new Date(now));
    svc.tick();
    expect(svc.state().sessions[0]?.status).toBe('completed');
    expect(say.mock.calls.some((c) => String(c[0]).includes('做完'))).toBe(true);

    const s = sanitizeAgentWatch({ enabled: false, tools: { codex: false } });
    expect(s.enabled).toBe(false);
    expect(s.tools.codex).toBe(false);
  });
});
