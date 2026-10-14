jest.unmock('fs');
jest.unmock('path');
jest.unmock('node:fs');
jest.unmock('node:path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CliHarnessService } from '../../../src/cli/CliHarnessService';

jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { removeHandler: () => undefined, handle: () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
}));

describe('CliHarnessService mock CLI', () => {
  const mockClaude = path.resolve(__dirname, '../../../scripts/mock-cli/mock-claude.mjs');
  const mockCodex = path.resolve(__dirname, '../../../scripts/mock-cli/mock-codex.mjs');

  beforeAll(() => {
    process.env.NOMI_CLAUDE_BIN = mockClaude;
    process.env.NOMI_CODEX_BIN = mockCodex;
    delete process.env.NOMI_USE_MOCK_CLI;
  });

  it('forwards to mock claude', async () => {
    const h = new CliHarnessService({
      root: path.join(os.tmpdir(), `harness-${Date.now()}`),
      logger: { info() {}, warn() {} },
      defaultCwd: process.cwd(),
    });
    h.setBackend('claude');
    const r = await h.send('hello');
    expect(r.text).toContain('Mock Claude');
    expect(h.state().toolsDisabled).toBe(true);
  });

  it('forwards to mock codex', async () => {
    const h = new CliHarnessService({
      root: path.join(os.tmpdir(), `harness-${Date.now()}-c`),
      logger: { info() {}, warn() {} },
      defaultCwd: process.cwd(),
    });
    h.setBackend('codex');
    const r = await h.send('hello');
    expect(r.text).toContain('Mock Codex');
  });

  it('closes stdin so CLIs that read piped input do not hang', async () => {
    // 模拟真实 CLI：stdin 为管道时先读到 EOF 才输出
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stdin-'));
    const bin = path.join(dir, 'stdin-codex.mjs');
    fs.writeFileSync(
      bin,
      [
        'process.stdin.resume();',
        "process.stdin.on('end', () => {",
        "  const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n');",
        "  emit({ type: 'thread.started', thread_id: 't1' });",
        "  emit({ type: 'item.completed', item: { id: 'i', type: 'agent_message', text: 'after-eof' } });",
        "  emit({ type: 'turn.completed', usage: {} });",
        '});',
      ].join('\n'),
    );
    const prev = process.env.NOMI_CODEX_BIN;
    process.env.NOMI_CODEX_BIN = bin;
    try {
      const h = new CliHarnessService({
        root: path.join(dir, 'root'),
        logger: { info() {}, warn() {} },
        defaultCwd: dir,
      });
      h.setBackend('codex');
      const r = await h.send('hello');
      expect(r.text).toContain('after-eof');
    } finally {
      process.env.NOMI_CODEX_BIN = prev;
    }
  }, 10_000);

  it('defaults to nomi with tools enabled', () => {
    const h = new CliHarnessService({
      root: path.join(os.tmpdir(), `harness-${Date.now()}-n`),
      logger: { info() {}, warn() {} },
    });
    expect(h.state().backend).toBe('nomi');
    expect(h.state().toolsDisabled).toBe(false);
  });
});

describe('CliHarnessService session handling', () => {
  // 需要可直接执行的 shebang 脚本（Windows 无法 spawn）
  const itPosix = process.platform === 'win32' ? it.skip : it;

  itPosix(
    'drops the CLI session id when switching backend and resumes codex with valid argv',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-argv-'));
      const bin = path.join(dir, 'argv-codex');
      // 记录收到的 argv，并回一个会话 id
      fs.writeFileSync(
        bin,
        [
          '#!/usr/bin/env node',
          "const fs = require('node:fs');",
          `fs.appendFileSync(${JSON.stringify(path.join(dir, 'argv.log'))}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
          "const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n');",
          "emit({ type: 'thread.started', thread_id: 'codex-thread' });",
          "emit({ type: 'item.completed', item: { id: 'i', type: 'agent_message', text: 'ok' } });",
        ].join('\n'),
        { mode: 0o755 },
      );
      const prev = process.env.NOMI_CODEX_BIN;
      process.env.NOMI_CODEX_BIN = bin;
      try {
        const h = new CliHarnessService({
          root: path.join(dir, 'root'),
          logger: { info() {}, warn() {} },
          defaultCwd: dir,
        });
        h.setBackend('claude');
        await h.send('hi');
        expect(h.state().cliSessionId).toBeTruthy();
        h.setBackend('codex');
        expect(h.state().cliSessionId).toBeNull();
        await h.send('one');
        await h.send('two');
        const calls = fs
          .readFileSync(path.join(dir, 'argv.log'), 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l) as string[]);
        expect(calls[0]).not.toContain('resume');
        expect(calls[1].slice(0, 2)).toEqual(['exec', 'resume']);
        expect(calls[1]).toContain('codex-thread');
        expect(calls[1]).not.toContain('--cd');
      } finally {
        process.env.NOMI_CODEX_BIN = prev;
      }
    },
  );
});
