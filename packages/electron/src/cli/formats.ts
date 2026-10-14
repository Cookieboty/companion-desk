/**
 * Claude Code / Codex 上游协议（与 CLI 原生协议对照；非原生格式需本地路由转换）。
 */

export const CLAUDE_API_FORMATS = [
  'anthropic_messages',
  'openai_chat_completions',
  'openai_responses',
  'gemini_generate_content',
] as const;
export type ClaudeApiFormat = (typeof CLAUDE_API_FORMATS)[number];

export const CODEX_API_FORMATS = [
  'openai_responses',
  'openai_chat_completions',
  'anthropic_messages',
] as const;
export type CodexApiFormat = (typeof CODEX_API_FORMATS)[number];

export type CliApiFormat = ClaudeApiFormat | CodexApiFormat;

export const CLAUDE_FORMAT_LABELS: Record<ClaudeApiFormat, string> = {
  anthropic_messages: 'Anthropic Messages（原生）',
  openai_chat_completions: 'OpenAI Chat Completions（需开启路由）',
  openai_responses: 'OpenAI Responses API（需开启路由）',
  gemini_generate_content: 'Gemini Native generateContent（需开启路由）',
};

export const CODEX_FORMAT_LABELS: Record<CodexApiFormat, string> = {
  openai_responses: 'Responses（原生）',
  openai_chat_completions: 'Chat Completions（需开启路由）',
  anthropic_messages: 'Anthropic Messages（需开启路由）',
};

export function isClaudeApiFormat(v: unknown): v is ClaudeApiFormat {
  return typeof v === 'string' && (CLAUDE_API_FORMATS as readonly string[]).includes(v);
}

export function isCodexApiFormat(v: unknown): v is CodexApiFormat {
  return typeof v === 'string' && (CODEX_API_FORMATS as readonly string[]).includes(v);
}

/** Claude Code 原生发 Anthropic Messages；Codex 原生发 Responses */
export function claudeFormatNeedsRouting(f: ClaudeApiFormat): boolean {
  return f !== 'anthropic_messages';
}

export function codexFormatNeedsRouting(f: CodexApiFormat): boolean {
  return f !== 'openai_responses';
}

export function formatNeedsRouting(kind: 'claude' | 'codex', format: CliApiFormat): boolean {
  return kind === 'claude'
    ? claudeFormatNeedsRouting(format as ClaudeApiFormat)
    : codexFormatNeedsRouting(format as CodexApiFormat);
}

export function defaultFormat(kind: 'claude' | 'codex'): CliApiFormat {
  return kind === 'claude' ? 'anthropic_messages' : 'openai_responses';
}
