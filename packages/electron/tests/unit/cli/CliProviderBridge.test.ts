jest.unmock('fs');
jest.unmock('path');
jest.unmock('node:fs');
jest.unmock('node:path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CliProviderBridge } from '../../../src/cli/CliProviderBridge';
import { claudeSettingsPath, codexConfigPath } from '../../../src/cli/configPatch';

jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { removeHandler: () => undefined, handle: () => undefined },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

describe('CliProviderBridge', () => {
  it('activates claude profile with backup', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-cli-home-'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-cli-root-'));
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      claudeSettingsPath(home),
      JSON.stringify({ env: { KEEP: 'yes' }, permissions: { allow: ['Read'] } }),
    );
    const b = new CliProviderBridge({
      root,
      home,
      logger: { info() {}, warn() {} },
    });
    const p = b.upsert({
      kind: 'claude',
      name: '测试',
      baseUrl: 'https://api.example.com',
      model: 'claude-test',
      apiKey: 'sk-test-key',
    });
    const r = b.activate(p.id);
    expect(r.ok).toBe(true);
    expect(r.backups.length).toBeGreaterThan(0);
    const settings = JSON.parse(fs.readFileSync(claudeSettingsPath(home), 'utf8'));
    expect(settings.env.ANTHROPIC_API_KEY).toBe('sk-test-key');
    expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://api.example.com');
    expect(settings.env.KEEP).toBe('yes');
    expect(settings.permissions.allow).toEqual(['Read']);
    // restore
    const ts = path.basename(path.dirname(r.backups[0]!));
    const restored = b.restoreBackup(ts);
    expect(restored.ok).toBe(true);
  });

  it('activates codex profile', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-cli-home-'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-cli-root-'));
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    const b = new CliProviderBridge({
      root,
      home,
      logger: { info() {}, warn() {} },
    });
    const p = b.upsert({
      kind: 'codex',
      name: '本地',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen2.5:0.5b',
      apiKey: 'ollama',
    });
    const r = b.activate(p.id);
    expect(r.ok).toBe(true);
    expect(r.restartRequired).toBe(true);
    const conf = fs.readFileSync(codexConfigPath(home), 'utf8');
    expect(conf).toContain('qwen2.5:0.5b');
    expect(conf).toContain('[model_providers.nomi]');
  });
});
