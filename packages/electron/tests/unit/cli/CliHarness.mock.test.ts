jest.unmock('fs');
jest.unmock('path');
jest.unmock('node:fs');
jest.unmock('node:path');

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

  it('defaults to nomi with tools enabled', () => {
    const h = new CliHarnessService({
      root: path.join(os.tmpdir(), `harness-${Date.now()}-n`),
      logger: { info() {}, warn() {} },
    });
    expect(h.state().backend).toBe('nomi');
    expect(h.state().toolsDisabled).toBe(false);
  });
});
