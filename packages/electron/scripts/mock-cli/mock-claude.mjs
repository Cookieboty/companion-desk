#!/usr/bin/env node
/**
 * Mock Claude Code CLI for CI / headed e2e.
 * Supports:
 *   --version | update
 *   单轮：-p <prompt> --output-format stream-json
 *   长驻：-p --input-format stream-json --output-format stream-json
 *     （stdin 逐行 NDJSON user / control_response；每轮 result 后进程不退出）
 * Env: NOMI_MOCK_CLAUDE_REPLY, NOMI_MOCK_SESSION, NOMI_MOCK_ASK_PERMISSION,
 *      NOMI_MOCK_PERMISSION_ID, NOMI_MOCK_TOOLS, NOMI_MOCK_DELAY_MS,
 *      NOMI_MOCK_CLAUDE_BOOT_LOG（可选：每次进程启动 append 一行，测复用）
 */
import fs from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const delayMs = Number(process.env.NOMI_MOCK_DELAY_MS || 0);
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write('2.0.0-mock (Claude Code Mock)\n');
  process.exit(0);
}
if (args.includes('update')) {
  process.stdout.write('Already up to date: 2.0.0-mock\n');
  process.exit(0);
}

const bootLog = process.env.NOMI_MOCK_CLAUDE_BOOT_LOG;
if (bootLog) {
  try {
    fs.appendFileSync(bootLog, `${process.pid}\n`);
  } catch {
    /* */
  }
}

const resumeIdx = args.indexOf('--resume');
const ownSession = process.env.NOMI_MOCK_SESSION || 'mock-claude-session-1';
const resumed = resumeIdx >= 0 ? args[resumeIdx + 1] : '';
const foreign = resumed && resumed !== ownSession;
const sessionId = resumed || ownSession;

function sleep() {
  if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function extractUserText(line) {
  try {
    const j = JSON.parse(line);
    if (j?.type === 'control_response') return { kind: 'control', j };
    if (j?.type === 'control_request') return { kind: 'control_request', j };
    if (typeof j.prompt === 'string') return { kind: 'user', text: j.prompt };
    if (j?.message?.content != null) {
      const c = j.message.content;
      return { kind: 'user', text: typeof c === 'string' ? c : JSON.stringify(c) };
    }
    if (typeof j.content === 'string') return { kind: 'user', text: j.content };
  } catch {
    /* */
  }
  return { kind: 'user', text: line };
}

async function runOnce(_prompt) {
  sleep();
  // 固定回复，便于既有单测断言；续接「外会话」时带 session id
  const text =
    process.env.NOMI_MOCK_CLAUDE_REPLY ||
    (foreign ? `【Mock Claude】已续接会话 ${resumed}` : '【Mock Claude】已收到，并完成演示回复。');

  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    model: 'mock-claude',
    pid: process.pid,
  });

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
    // 长驻模式下由外层 line 循环把 control_response 投递进来；单轮模式在下面等
    if (!streamIn) {
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
    } else {
      const decision = await waitPermission();
      if (!decision) {
        emit({
          type: 'result',
          session_id: sessionId,
          result: '【Mock Claude】权限被拒绝',
          subtype: 'success',
        });
        return;
      }
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

  const chunks = text.match(/.{1,8}/gs) || [text];
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
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });
  emit({
    type: 'result',
    session_id: sessionId,
    result: text,
    subtype: 'success',
  });
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

/** 长驻：permission 等待队列 */
let permissionWaiter = null;
function waitPermission() {
  return new Promise((resolve) => {
    permissionWaiter = resolve;
  });
}

const promptIdx = args.findIndex((a) => a === '-p' || a === '--print');
const inlineCandidate = promptIdx >= 0 ? args[promptIdx + 1] : '';
const inline = inlineCandidate && !String(inlineCandidate).startsWith('-') ? inlineCandidate : '';
const streamIn = args.includes('--input-format') && args.includes('stream-json');

if (streamIn) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let busy = false;
  const queue = [];

  const pump = () => {
    if (busy) return;
    const next = queue.shift();
    if (!next) return;
    busy = true;
    void runOnce(next)
      .catch(() => {})
      .finally(() => {
        busy = false;
        pump();
      });
  };

  rl.on('line', (line) => {
    const parsed = extractUserText(line);
    if (parsed.kind === 'control') {
      if (permissionWaiter) {
        const allowed = parsed.j?.response?.response?.behavior === 'allow';
        const w = permissionWaiter;
        permissionWaiter = null;
        w(Boolean(allowed));
      }
      return;
    }
    if (parsed.kind === 'control_request') {
      // interrupt 等：直接退出，模拟被中止
      if (parsed.j?.request?.subtype === 'interrupt') {
        process.exit(0);
      }
      return;
    }
    if (parsed.text.trim()) {
      queue.push(parsed.text);
      pump();
    }
  });
  rl.on('close', () => {
    // stdin EOF：结束长驻
    process.exit(0);
  });
} else {
  void runOnce(inline || '').then(() => process.exit(0));
}
