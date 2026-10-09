import { describe, expect, it, vi } from 'vitest';

import { ConversationStore, createMemoryStorage } from '../src/services/conversationStore';
import { buildProviderMessages } from '../src/services/history';
import { SdkIPCClient } from '../src/services/IPCClient';
import type { ChatMessage } from '../src/types/chat';

const msg = (
  id: string,
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
) => ({ id, role, content, timestamp: Number(id), ...extra }) as ChatMessage;

describe('buildProviderMessages', () => {
  it('prepends system prompt, keeps prior turns, appends the new user input', () => {
    const history = [msg('1', 'user', 'hi'), msg('2', 'assistant', 'hello')];
    expect(buildProviderMessages(history, 'how are you?', '  be brief ')).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'how are you?' },
    ]);
  });

  it('drops empty and failed messages; no system prompt when blank', () => {
    const history = [
      msg('1', 'user', 'q'),
      msg('2', 'assistant', ''),
      msg('3', 'assistant', 'partial', { error: 'boom' }),
    ];
    expect(buildProviderMessages(history, 'again', '')).toEqual([
      { role: 'user', content: 'q' },
      { role: 'user', content: 'again' },
    ]);
  });
});

describe('ConversationStore', () => {
  const mk = (storage = createMemoryStorage()) => {
    let n = 0;
    return new ConversationStore({ storage, now: () => 1000 + n, newId: () => `c${++n}` });
  };

  it('persists messages per conversation and supports switching / clearing', () => {
    const storage = createMemoryStorage();
    const s = mk(storage);
    const first = s.currentId();
    s.append(msg('1', 'user', 'first question'));
    const second = s.create().id;
    s.append(msg('2', 'user', 'other'));

    expect(s.getMessages(first).map((m) => m.content)).toEqual(['first question']);
    expect(s.getMessages().map((m) => m.content)).toEqual(['other']);
    expect(s.list().find((c) => c.id === first)!.name).toBe('first question');

    s.switchTo(first);
    expect(s.currentId()).toBe(first);
    s.clear();
    expect(s.getMessages()).toEqual([]);
    expect(s.getMessages(second)).toHaveLength(1);

    // 新实例读同一存储（模拟重启）
    const reopened = new ConversationStore({ storage });
    expect(reopened.currentId()).toBe(first);
    expect(reopened.getMessages(second)[0]!.content).toBe('other');
  });

  it('trims to maxMessages and migrates the legacy single-history key', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'ai-chat:history',
      JSON.stringify([msg('1', 'user', 'old'), msg('2', 'assistant', 'reply')]),
    );
    const s = new ConversationStore({ storage, maxMessages: 3 });
    expect(storage.getItem('ai-chat:history')).toBeNull();
    expect(s.getMessages().map((m) => m.content)).toEqual(['old', 'reply']);
    s.append(msg('3', 'user', 'a'));
    s.append(msg('4', 'user', 'b'));
    expect(s.getMessages().map((m) => m.content)).toEqual(['reply', 'a', 'b']);
  });

  it('delete removes the conversation and resets current', () => {
    const s = mk();
    const id = s.currentId();
    s.delete(id);
    expect(s.list()).toEqual([]);
    expect(s.currentId()).not.toBe(id);
  });
});

describe('SdkIPCClient · multi-turn', () => {
  function fakeClient() {
    const calls: Array<{ kind: string; opts: { messages: unknown[]; provider?: string } }> = [];
    const client = {
      chat: {
        async sendMessage(opts: { messages: unknown[] }) {
          calls.push({ kind: 'send', opts });
          return { content: 'reply' };
        },
        stream(opts: { messages: unknown[] }) {
          calls.push({ kind: 'stream', opts });
          return (async function* () {
            yield { type: 'delta', content: 'str' };
            yield { type: 'done', finishReason: 'stop' };
          })();
        },
        abort: vi.fn(),
      },
      memory: { userProfile: { get: () => undefined, set: vi.fn() } },
      dispose: vi.fn(),
    };
    return { client, calls };
  }

  it('sends system prompt + prior turns for both non-stream and stream', async () => {
    const { client, calls } = fakeClient();
    const ipc = new SdkIPCClient(client as never);
    const history = [msg('1', 'user', 'q1'), msg('2', 'assistant', 'a1')];

    await expect(ipc.sendMessage('q2', 'openai', history)).resolves.toBe('reply');
    const chunks: string[] = [];
    await ipc.sendStreamMessage('q3', 'openai', (c) => chunks.push(c), [
      ...history,
      msg('3', 'user', 'q2'),
      msg('4', 'assistant', 'reply'),
    ]);

    expect(chunks).toEqual(['str']);
    const [send, stream] = calls;
    expect(send!.opts.provider).toBe('openai');
    expect(send!.opts.messages).toEqual([
      { role: 'system', content: expect.stringContaining('Companion Desk') },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
    expect(
      (stream!.opts.messages as Array<{ content: string }>).map((m) => m.content).slice(1),
    ).toEqual(['q1', 'a1', 'q2', 'reply', 'q3']);
  });
});
