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

const reply = process.env.NOMI_MOCK_CODEX_REPLY || '【Mock Codex】任务完成。';
const threadId = process.env.NOMI_MOCK_SESSION || 'mock-codex-thread-1';

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
