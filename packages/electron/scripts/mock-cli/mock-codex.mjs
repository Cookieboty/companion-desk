#!/usr/bin/env node
/**
 * Mock Codex CLI for CI / headed e2e.
 * Supports: --version | exec --json [prompt] | update
 */
const args = process.argv.slice(2);
// 并发测试用：每轮模拟耗时（毫秒）
const delayMs = Number(process.env.NOMI_MOCK_DELAY_MS || 0);
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write('codex-cli 0.0.0-mock\n');
  process.exit(0);
}
if (args.includes('update')) {
  process.stdout.write('Already up to date\n');
  process.exit(0);
}

// exec resume [...flags] <id> <prompt>：续接历史会话
const resumeAt = args.indexOf('resume');
const resumed = resumeAt >= 0 ? args.filter((a) => !a.startsWith('-')).slice(2)[0] : '';
const ownThread = process.env.NOMI_MOCK_SESSION || 'mock-codex-thread-1';
// 只有续接「别的」会话（历史会话）才改回复，普通多轮对话的回复保持不变
const foreign = resumed && resumed !== ownThread;
const reply =
  process.env.NOMI_MOCK_CODEX_REPLY ||
  (foreign ? `【Mock Codex】已续接会话 ${resumed}` : '【Mock Codex】任务完成。');
const threadId = resumed || ownThread;

if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

const isExec = args[0] === 'exec' || args[0] === 'e';
if (!isExec) {
  process.stderr.write('mock-codex: only exec/--version/update supported\n');
  process.exit(2);
}

emit({ type: 'thread.started', thread_id: threadId });
emit({ type: 'turn.started' });
emit({
  type: 'item.completed',
  item: { id: 'item_1', type: 'agent_message', text: reply, status: 'completed' },
});
emit({
  type: 'turn.completed',
  usage: { input_tokens: 10, output_tokens: 8 },
});
process.exit(0);
