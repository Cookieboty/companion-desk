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
  patchClaudeSettings,
  patchCodexAuth,
  patchCodexToml,
} from '../../../src/cli/configPatch';
import {
  claudeFormatNeedsRouting,
  codexFormatNeedsRouting,
  formatNeedsRouting,
} from '../../../src/cli/formats';

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
    expect(out).toContain('wire_api = "responses"');
    expect(out).toContain('other = 1');
  });

  it('re-patching codex toml keeps a single provider table', () => {
    const patch = { model: 'm1', model_provider: 'nomi', base_url: 'http://a/v1' };
    const once = patchCodexToml('model = "x"\n[profiles.p]\nmodel = "y"\n', patch);
    const twice = patchCodexToml(once, { ...patch, model: 'm2', base_url: 'http://b/v1' });
    expect(twice.match(/^\[model_providers\.nomi\]$/gm)).toHaveLength(1);
    expect(twice.match(/^base_url = /gm)).toHaveLength(1);
    expect(twice).toContain('base_url = "http://b/v1"');
    expect(twice).toContain('name = "nomi"');
    expect(twice).toContain('model = "m2"');
    // 其它表保持原样
    expect(twice).toContain('[profiles.p]\nmodel = "y"');
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
});

describe('api formats routing flags', () => {
  it('claude native does not need routing; others do', () => {
    expect(claudeFormatNeedsRouting('anthropic_messages')).toBe(false);
    expect(claudeFormatNeedsRouting('openai_chat_completions')).toBe(true);
    expect(claudeFormatNeedsRouting('openai_responses')).toBe(true);
    expect(claudeFormatNeedsRouting('gemini_generate_content')).toBe(true);
  });

  it('codex native does not need routing; others do', () => {
    expect(codexFormatNeedsRouting('openai_responses')).toBe(false);
    expect(codexFormatNeedsRouting('openai_chat_completions')).toBe(true);
    expect(codexFormatNeedsRouting('anthropic_messages')).toBe(true);
    expect(formatNeedsRouting('codex', 'openai_chat_completions')).toBe(true);
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

describe('dsh update recipe', () => {
  it('only uses npm global install (no self-update)', () => {
    const r = updateRecipes('dsh', '/usr/local/bin/dsh', 'unknown');
    expect(r).toHaveLength(1);
    expect(r[0]!.via).toBe('npm');
    expect(r[0]!.argv.slice(1)).toEqual(['install', '-g', '@deepseek-ai/dsh@latest']);
    expect(isAllowedUpdateArgv(r[0]!.argv)).toBe(true);
  });
  it('rejects dsh update and extra npm args', () => {
    expect(isAllowedUpdateArgv(['dsh', 'update'])).toBe(false);
    expect(
      isAllowedUpdateArgv(['npm', 'install', '-g', '@deepseek-ai/dsh@latest', '--prefix=/x']),
    ).toBe(false);
  });
});
