import { describe, expect, it } from 'vitest';

import { nativeFormat, presetFormat } from '../src/components/ProvidersPage/cliBrand';
import { CLI_DEFAULT_FORMAT, CLI_FORMATS } from '../src/components/ProvidersPage/CliProviderEditor';

describe('CLI 上游格式默认与原生判定', () => {
  it('各端点默认格式为自己的原生协议', () => {
    expect(CLI_DEFAULT_FORMAT.claude).toBe('anthropic_messages');
    expect(CLI_DEFAULT_FORMAT.codex).toBe('openai_responses');
    expect(CLI_DEFAULT_FORMAT.dsh).toBe('openai_chat_completions');
  });

  it('默认格式对端点均为原生，无需路由', () => {
    for (const kind of ['claude', 'codex', 'dsh'] as const) {
      expect(nativeFormat(kind, CLI_DEFAULT_FORMAT[kind])).toBe(true);
    }
  });

  it('Claude / Codex 非原生格式需要路由；dsh 三种均原生', () => {
    expect(nativeFormat('claude', 'openai_chat_completions')).toBe(false);
    expect(nativeFormat('claude', 'openai_responses')).toBe(false);
    expect(nativeFormat('codex', 'openai_chat_completions')).toBe(false);
    expect(nativeFormat('codex', 'anthropic_messages')).toBe(false);
    expect(nativeFormat('dsh', 'anthropic_messages')).toBe(true);
    expect(nativeFormat('dsh', 'openai_responses')).toBe(true);
  });

  it('下拉选项与标签对齐 cc-switch / formats.ts', () => {
    expect(CLI_FORMATS.claude.map((f) => f.value)).toEqual([
      'anthropic_messages',
      'openai_chat_completions',
      'openai_responses',
      'gemini_generate_content',
    ]);
    expect(CLI_FORMATS.codex.map((f) => f.value)).toEqual([
      'openai_responses',
      'openai_chat_completions',
      'anthropic_messages',
    ]);
    expect(CLI_FORMATS.claude[0]!.label).toContain('原生');
    expect(CLI_FORMATS.codex[0]!.label).toContain('原生');
    expect(CLI_FORMATS.dsh.every((f) => f.label.includes('原生'))).toBe(true);
  });

  it('presetFormat 仅作协议映射参考，不应当作新建默认', () => {
    expect(presetFormat('openai-chat')).toBe('openai_chat_completions');
    expect(presetFormat('anthropic')).toBe('anthropic_messages');
    expect(presetFormat('openai-responses')).toBe('openai_responses');
    // Codex 端点新建应忽略上述映射，坚持 Responses
    expect(CLI_DEFAULT_FORMAT.codex).not.toBe(presetFormat('openai-chat'));
  });
});
