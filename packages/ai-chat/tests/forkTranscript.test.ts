import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../src/types/chat';
import { buildCliContextPreface, compactTranscript } from '../src/utils/forkTranscript';

const msg = (
  id: string,
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
) => ({ id, role, content, timestamp: Number(id), ...extra }) as ChatMessage;

describe('compactTranscript', () => {
  it('keeps user/assistant text and drops system / errors / empty', () => {
    const out = compactTranscript([
      msg('1', 'system', 'ignore'),
      msg('2', 'user', 'hi'),
      msg('3', 'assistant', '', { error: 'boom' }),
      msg('4', 'assistant', 'hello'),
      msg('5', 'user', '[tool: bash] huge output'),
    ]);
    expect(out.map((m) => m.content)).toEqual(['hi', 'hello', '[工具调用已省略]']);
  });

  it('builds a CLI preface that does not claim resume', () => {
    const text = buildCliContextPreface(
      [msg('1', 'user', 'q'), msg('2', 'assistant', 'a')],
      'Nomi chat',
    );
    expect(text).toContain('Nomi chat');
    expect(text).toContain('User: q');
    expect(text).toContain('Assistant: a');
    expect(text).toContain('并非本 CLI 的可续接会话');
    expect(text.toLowerCase()).not.toMatch(/\bresume\b/);
  });
});
