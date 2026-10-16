jest.unmock('fs');
jest.unmock('path');

import fs from 'node:fs';
import path from 'node:path';

import {
  parseAiderChunk,
  parseClaudeChunk,
  parseCodexChunk,
  parseDshChunk,
  parseGeminiFile,
} from '../../../src/usage/logParsers';

const fx = (n: string) =>
  fs.readFileSync(path.join(__dirname, '../../fixtures/history', n), 'utf8');
const line = (o: unknown) => `${JSON.stringify(o)}\n`;

describe('Claude Code 日志解析', () => {
  const asst = (id: string, usage: object, over: object = {}) =>
    line({
      type: 'assistant',
      timestamp: '2026-10-14T10:00:00.000Z',
      sessionId: 's1',
      cwd: '/w/app',
      message: { id, model: 'claude-sonnet-4-5-20250929', usage, ...over },
    });

  it('取 message.usage：缓存读写另计、项目名取 cwd 末段', () => {
    const [r] = parseClaudeChunk(
      asst('msg_1', {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 300,
        cache_creation_input_tokens: 40,
      }),
    );
    expect(r).toMatchObject({
      key: 'claude:msg_1',
      source: 'claude',
      via: 'log',
      model: 'claude-sonnet-4-5-20250929',
      input: 10,
      output: 20,
      cacheRead: 300,
      cacheWrite: 40,
      session: 's1',
      project: 'app',
    });
    expect(r!.ts).toBe(Date.parse('2026-10-14T10:00:00.000Z'));
  });

  it('cache_creation 分档字段也能算缓存写', () => {
    const [r] = parseClaudeChunk(
      asst('msg_2', {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation: { ephemeral_5m_input_tokens: 5, ephemeral_1h_input_tokens: 7 },
      }),
    );
    expect(r!.cacheWrite).toBe(12);
  });

  it('跳过合成消息 / 全零 usage / 非 assistant / 损坏行', () => {
    const text =
      asst('msg_3', { input_tokens: 5, output_tokens: 5 }, { model: '<synthetic>' }) +
      asst('msg_4', { input_tokens: 0, output_tokens: 0 }) +
      line({ type: 'user', message: { role: 'user' } }) +
      '{broken\n';
    expect(parseClaudeChunk(text)).toEqual([]);
  });

  it('非 Anthropic 网关的消息 id 带上会话，避免不同会话撞键', () => {
    const a = parseClaudeChunk(asst('chatcmpl-64', { input_tokens: 1, output_tokens: 1 }))[0]!;
    expect(a.key).toBe('claude:s1:chatcmpl-64');
  });

  it('真实日志夹具', () => {
    const recs = parseClaudeChunk(fx('claude-real.jsonl'));
    expect(recs).toHaveLength(1);
    expect(recs[0]!.model).toBe('qwen2.5:0.5b');
  });
});

describe('Codex 日志解析', () => {
  it('夹具：模型 / 会话 / 缓存拆分', () => {
    const state: Record<string, unknown> = {};
    const recs = parseCodexChunk(fx('codex-rollout.jsonl'), state);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      source: 'codex',
      session: '01a13a9b-34b0-7612-ba36-613a55008483',
      input: 3774 - 18,
      cacheRead: 18,
      output: 2,
      project: 'tmp',
    });
  });

  it('同一累计值重复出现只记一次；跨块续读靠 state', () => {
    const state: Record<string, unknown> = {};
    const meta = line({
      timestamp: '2026-10-14T10:00:00Z',
      type: 'session_meta',
      payload: { id: 'sid-1', cwd: '/w/x', model_provider: 'openai' },
    });
    const ctx = line({
      timestamp: '2026-10-14T10:00:01Z',
      type: 'turn_context',
      payload: { model: 'gpt-5-codex' },
    });
    const tc = (total: number, last: number, t: string) =>
      line({
        timestamp: t,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { total_tokens: total },
            last_token_usage: { input_tokens: last, cached_input_tokens: 0, output_tokens: 1 },
          },
        },
      });
    const a = parseCodexChunk(meta + ctx + tc(100, 99, '2026-10-14T10:00:02Z'), state);
    expect(a).toHaveLength(1);
    const b = parseCodexChunk(
      tc(100, 99, '2026-10-14T10:00:03Z') + tc(250, 149, '2026-10-14T10:00:04Z'),
      state,
    );
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({
      key: 'codex:sid-1:250',
      model: 'gpt-5-codex',
      provider: 'openai',
    });
  });

  it('info 为空（只有额度刷新）不记', () => {
    const t = line({
      timestamp: '2026-10-14T10:00:00Z',
      type: 'event_msg',
      payload: { type: 'token_count', info: null, rate_limits: {} },
    });
    expect(parseCodexChunk(t, {})).toEqual([]);
  });
});

describe('dsh / Gemini / Aider', () => {
  it('dsh 夹具：assistant/message 的 usage + request/context 模型', () => {
    const recs = parseDshChunk(fx('dsh-session.jsonl'), {});
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({
      source: 'dsh',
      model: 'qwen2.5:0.5b',
      provider: 'nomi',
      input: 4651 - 3,
      cacheRead: 3,
      output: 3,
      project: 'work',
    });
    expect(recs[0]!.key).toMatch(/^dsh:session-887fa07d.*:15$/);
  });

  it('Gemini 整份 JSON：按消息 id 去重键、缓存拆分、thoughts 计入输出', () => {
    const json = JSON.stringify({
      sessionId: 'g1',
      messages: [
        { type: 'user', content: 'hi' },
        {
          id: 'm1',
          type: 'gemini',
          model: 'gemini-2.5-pro',
          timestamp: '2026-10-14T10:00:00Z',
          tokens: { input: 100, cached: 40, output: 10, thoughts: 5, total: 115 },
        },
      ],
    });
    const recs = parseGeminiFile(json, '/w/gem');
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      key: 'gemini:g1:m1',
      input: 60,
      cacheRead: 40,
      output: 15,
      project: 'gem',
    });
    expect(parseGeminiFile('{half')).toEqual([]);
  });

  it('Aider analytics', () => {
    const recs = parseAiderChunk(
      line({
        event: 'message_send',
        time: 1792000000,
        properties: { main_model: 'gpt-4o', prompt_tokens: 500, completion_tokens: 50 },
      }) + line({ event: 'launched' }),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ source: 'aider', model: 'gpt-4o', input: 500, output: 50 });
    expect(recs[0]!.ts).toBe(1792000000_000);
  });
});
