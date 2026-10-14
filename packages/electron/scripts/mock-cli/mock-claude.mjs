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

const reply = process.env.NOMI_MOCK_CLAUDE_REPLY || '【Mock Claude】已收到，并完成演示回复。';
const sessionId = process.env.NOMI_MOCK_SESSION || 'mock-claude-session-1';

if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function runOnce(prompt) {
  emit({ type: 'system', subtype: 'init', session_id: sessionId, model: 'mock-claude' });
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
    if (msg.trim()) runOnce(msg);
  });
} else {
  runOnce(inline || '');
  process.exit(0);
}
