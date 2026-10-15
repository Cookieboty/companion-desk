#!/usr/bin/env node
/**
 * Mock Claude Code CLI for CI / headed e2e.
 * Supports: --version | -p --output-format stream-json [--input-format stream-json]
 * Env NOMI_MOCK_CLAUDE_REPLY overrides assistant text.
 */
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
// 并发测试用：每轮模拟耗时（毫秒）
const delayMs = Number(process.env.NOMI_MOCK_DELAY_MS || 0);
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write('2.0.0-mock (Claude Code Mock)\n');
  process.exit(0);
}
if (args.includes('update')) {
  process.stdout.write('Already up to date: 2.0.0-mock\n');
  process.exit(0);
}

// --resume <id>：续接历史会话（e2e / 单测据此确认续接参数）
const resumeIdx = args.indexOf('--resume');
const ownSession = process.env.NOMI_MOCK_SESSION || 'mock-claude-session-1';
const resumed = resumeIdx >= 0 ? args[resumeIdx + 1] : '';
// 只有续接「别的」会话（历史会话）才改回复，普通多轮对话的回复保持不变
const foreign = resumed && resumed !== ownSession;
const reply =
  process.env.NOMI_MOCK_CLAUDE_REPLY ||
  (foreign ? `【Mock Claude】已续接会话 ${resumed}` : '【Mock Claude】已收到，并完成演示回复。');
const sessionId = resumed || ownSession;

if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function readStdinLine() {
  return new Promise((resolve) => {
    const onData = (chunk) => {
      const s = String(chunk);
      const nl = s.indexOf('\n');
      if (nl >= 0) {
        process.stdin.off('data', onData);
        resolve(s.slice(0, nl));
      }
    };
    process.stdin.on('data', onData);
  });
}

async function runOnce(prompt) {
  emit({ type: 'system', subtype: 'init', session_id: sessionId, model: 'mock-claude' });
  // NOMI_MOCK_ASK_PERMISSION=1：发一条 can_use_tool，等 harness 回 control_response
  if (process.env.NOMI_MOCK_ASK_PERMISSION === '1') {
    const reqId = process.env.NOMI_MOCK_PERMISSION_ID || 'mock-perm-1';
    emit({
      type: 'control_request',
      request_id: reqId,
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'echo mock-permission' },
      },
    });
    const line = await readStdinLine();
    let allowed = false;
    try {
      const j = JSON.parse(line);
      allowed = j?.response?.response?.behavior === 'allow';
    } catch {
      /* deny */
    }
    if (!allowed) {
      emit({
        type: 'result',
        session_id: sessionId,
        result: '【Mock Claude】权限被拒绝',
        subtype: 'success',
      });
      return;
    }
  }
  if (process.env.NOMI_MOCK_TOOLS === '1') {
    emit({
      type: 'assistant',
      session_id: sessionId,
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'mock-tu-1', name: 'Bash', input: { command: 'echo hi' } },
        ],
      },
    });
    emit({
      type: 'user',
      session_id: sessionId,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'mock-tu-1', content: 'hi', is_error: false },
        ],
      },
    });
  }
  const chunks = reply.match(/.{1,8}/gs) || [reply];
  for (const c of chunks) {
    emit({
      type: 'stream_event',
      session_id: sessionId,
      event: { delta: { type: 'text_delta', text: c } },
    });
  }
  emit({
    type: 'assistant',
    session_id: sessionId,
    message: { role: 'assistant', content: [{ type: 'text', text: reply }] },
  });
  emit({
    type: 'result',
    session_id: sessionId,
    result: reply,
    subtype: 'success',
  });
}

const promptIdx = args.findIndex((a) => a === '-p' || a === '--print');
const inline = promptIdx >= 0 ? args[promptIdx + 1] : '';
const streamIn = args.includes('--input-format') && args.includes('stream-json');

if (streamIn) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    let msg = '';
    try {
      const j = JSON.parse(line);
      if (typeof j.prompt === 'string') msg = j.prompt;
      else if (j.message?.content) msg = String(j.message.content);
      else if (typeof j.content === 'string') msg = j.content;
    } catch {
      msg = line;
    }
    if (msg.trim()) void runOnce(msg);
  });
} else {
  void runOnce(inline || '').then(() => process.exit(0));
}
