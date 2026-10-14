jest.unmock('fs');
jest.unmock('path');
jest.unmock('node:fs');
jest.unmock('node:path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isAllowedUpdateArgv, updateRecipes } from '../../../src/cli/CliUpdateService';
import {
  backupFile,
  hasCcSwitch,
  patchClaudeSettings,
  patchCodexAuth,
  patchCodexToml,
} from '../../../src/cli/configPatch';

describe('configPatch', () => {
  it('patches claude settings env only', () => {
    const raw = JSON.stringify(
      { env: { FOO: '1', ANTHROPIC_API_KEY: 'old' }, permissions: { allow: ['Bash'] } },
      null,
      2,
    );
    const next = JSON.parse(
      patchClaudeSettings(raw, {
        ANTHROPIC_API_KEY: 'new-key',
        ANTHROPIC_BASE_URL: 'https://example.com',
      }),
    );
    expect(next.env.ANTHROPIC_API_KEY).toBe('new-key');
    expect(next.env.ANTHROPIC_BASE_URL).toBe('https://example.com');
    expect(next.env.FOO).toBe('1');
    expect(next.permissions.allow).toEqual(['Bash']);
  });

  it('patches codex toml model + provider', () => {
    const raw = 'model = "gpt-4"\nother = 1\n';
    const out = patchCodexToml(raw, {
      model: 'gpt-test',
      model_provider: 'nomi',
      base_url: 'http://127.0.0.1:11434/v1',
    });
    expect(out).toContain('model = "gpt-test"');
    expect(out).toContain('[model_providers.nomi]');
    expect(out).toContain('base_url = "http://127.0.0.1:11434/v1"');
    expect(out).toContain('other = 1');
  });

  it('patches auth.json', () => {
    const out = JSON.parse(patchCodexAuth(null, 'sk-test'));
    expect(out.OPENAI_API_KEY).toBe('sk-test');
  });

  it('backupFile copies', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-bak-'));
    const src = path.join(dir, 'a.json');
    fs.writeFileSync(src, '{"a":1}');
    const dest = backupFile(src, path.join(dir, 'b'), 'a.json');
    expect(dest).toBeTruthy();
    expect(fs.readFileSync(dest!, 'utf8')).toBe('{"a":1}');
  });

  it('detects cc-switch dir', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-home-'));
    expect(hasCcSwitch(home)).toBe(false);
    fs.mkdirSync(path.join(home, '.cc-switch'));
    expect(hasCcSwitch(home)).toBe(true);
  });
});

describe('update whitelist', () => {
  it('allows only known argv', () => {
    expect(isAllowedUpdateArgv(['claude', 'update'])).toBe(true);
    expect(isAllowedUpdateArgv(['codex', 'update'])).toBe(true);
    expect(isAllowedUpdateArgv(['npm', 'install', '-g', '@anthropic-ai/claude-code@latest'])).toBe(
      true,
    );
    expect(isAllowedUpdateArgv(['npm', 'install', '-g', 'evil'])).toBe(false);
    expect(isAllowedUpdateArgv(['bash', '-c', 'rm -rf /'])).toBe(false);
  });

  it('recipes prefer self update then npm', () => {
    const r = updateRecipes('claude', '/usr/bin/claude', 'native');
    expect(r[0]!.argv).toEqual(['/usr/bin/claude', 'update']);
    expect(isAllowedUpdateArgv(r[0]!.argv)).toBe(true);
  });
});
