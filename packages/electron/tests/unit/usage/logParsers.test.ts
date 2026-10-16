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

  it('cache_creation 分档字段也能算缓存写，1h 档单独记', () => {
    const [r] = parseClaudeChunk(
      asst('msg_2', {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation: { ephemeral_5m_input_tokens: 5, ephemeral_1h_input_tokens: 7 },
      }),
    );
    expect(r!.cacheWrite).toBe(12);
    expect(r!.cacheWrite1h).toBe(7);
  });

  it('总量字段大于分档之和时余量记 5m；纯 5m / 无分档的记录不带 cacheWrite1h', () => {
    const [a] = parseClaudeChunk(
      asst('msg_a', {
        output_tokens: 1,
        cache_creation_input_tokens: 100,
        cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 30 },
      }),
    );
    expect(a).toMatchObject({ cacheWrite: 100, cacheWrite1h: 30 });
    const [b] = parseClaudeChunk(
      asst('msg_b', { output_tokens: 1, cache_creation_input_tokens: 50 }),
    );
    expect(b!.cacheWrite).toBe(50);
    expect('cacheWrite1h' in b!).toBe(false);
    const [c] = parseClaudeChunk(
      asst('msg_c', {
        output_tokens: 1,
        cache_creation_input_tokens: 5,
        cache_creation: { ephemeral_1h_input_tokens: 99 },
      }),
    );
    expect(c!.cacheWrite1h).toBe(5); // 1h 不会超过总量
  });

  it('speed=fast 打 fast 标记；standard / 缺省不带', () => {
    const [a] = parseClaudeChunk(asst('msg_f', { output_tokens: 3, speed: 'fast' }));
    expect(a!.fast).toBe(true);
    const [b] = parseClaudeChunk(asst('msg_g', { output_tokens: 3, speed: 'standard' }));
    expect('fast' in b!).toBe(false);
  });

  it('同一 message.id 拆成多行：块内合并取各字段最大；requestId 缺失 / 不同都不影响', () => {
    const text =
      asst('msg_dup', { input_tokens: 10, output_tokens: 2 }, {}) +
      asst('msg_dup', {
        input_tokens: 10,
        output_tokens: 30,
        cache_creation: { ephemeral_1h_input_tokens: 8 },
        cache_creation_input_tokens: 8,
        speed: 'fast',
      }) +
      asst('msg_dup', { input_tokens: 10, output_tokens: 20 });
    const recs = parseClaudeChunk(
      text.replace('"message"', '"requestId":"req_1","message"').split('\n').join('\n'),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      key: 'claude:msg_dup',
      output: 30,
      cacheWrite: 8,
      cacheWrite1h: 8,
      fast: true,
    });
  });

  it('没有 message.id 时才用 requestId 当键', () => {
    const l = line({
      type: 'assistant',
      timestamp: '2026-10-14T10:00:00.000Z',
      sessionId: 's1',
      requestId: 'req_9',
      message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 1, output_tokens: 1 } },
    });
    expect(parseClaudeChunk(l)[0]!.key).toBe('claude:s1:req_9');
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

describe('Codex fork / subagent 重放去重', () => {
  it('分叉 rollout 开头重放的父会话 token_count 不记账；只记真实新增的一轮', () => {
    const state: Record<string, unknown> = {};
    const recs = parseCodexChunk(fx('codex-fork-child.jsonl'), state);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      key: 'codex:child-0002:3000',
      session: 'child-0002', // 重放进来的父 session_meta 没有覆盖会话 id
      input: 400,
      cacheRead: 100,
      output: 100,
      model: 'gpt-5-codex',
      project: 'proj',
    });
  });

  it('父会话照常记账；父 + 子合计 = 父的 2 条 + 子的 1 条（没有重复）', () => {
    const parent = parseCodexChunk(fx('codex-fork-parent.jsonl'), {});
    const child = parseCodexChunk(fx('codex-fork-child.jsonl'), {});
    expect(parent).toHaveLength(2);
    const sum = [...parent, ...child].reduce((a, r) => a + r.input + r.cacheRead + r.output, 0);
    expect(sum).toBe(1100 + 1300 + 600);
  });

  it('跨块续读：重放段在第一块、真实轮次在第二块，state 保持跳过 / 解除状态', () => {
    const lines = fx('codex-fork-child.jsonl').split('\n').filter(Boolean);
    const state: Record<string, unknown> = {};
    const a = parseCodexChunk(`${lines.slice(0, 4).join('\n')}\n`, state);
    expect(a).toEqual([]);
    const b = parseCodexChunk(`${lines.slice(4).join('\n')}\n`, state);
    expect(b).toHaveLength(1);
    expect(b[0]!.key).toBe('codex:child-0002:3000');
  });

  it('重放行保留父会话原时间戳（早于分叉时刻）也不记账', () => {
    const meta = line({
      timestamp: '2026-10-14T11:00:00.000Z',
      type: 'session_meta',
      payload: { id: 'c', forked_from_id: 'p', cwd: '/w/x' },
    });
    const old = line({
      timestamp: '2026-10-14T10:00:05.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { total_tokens: 50 },
          last_token_usage: { input_tokens: 40, output_tokens: 10 },
        },
      },
    });
    const live = old
      .replace('2026-10-14T10:00:05.000Z', '2026-10-14T11:00:30.000Z')
      .replace('50', '90');
    const recs = parseCodexChunk(meta + old + live, {});
    expect(recs).toHaveLength(1);
    expect(recs[0]!.key).toBe('codex:c:90');
  });

  it('非分叉会话不受影响（行间距再小也照常记账）', () => {
    const recs = parseCodexChunk(fx('codex-fork-parent.jsonl'), {});
    expect(recs.map((r) => r.key)).toEqual(['codex:parent-0001:1100', 'codex:parent-0001:2400']);
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
      // inputTokens 不含缓存（totalTokens = input + output + cacheRead）
      input: 4651,
      cacheRead: 3,
      output: 3,
      project: 'work',
    });
    expect(recs[0]!.key).toMatch(/^dsh:session-887fa07d.*:15$/);
    expect(recs[1]).toMatchObject({ input: 13, cacheRead: 4656, output: 3 });
  });

  it('dsh 口径自洽：夹具里每条 usage 都满足 total = input + output + cacheRead', () => {
    for (const l of fx('dsh-session.jsonl').split('\n')) {
      if (!l.includes('assistant/message')) continue;
      const u = JSON.parse(l).data.usage;
      expect(u.totalTokens).toBe(u.inputTokens + u.outputTokens + (u.cacheReadTokens ?? 0));
    }
  });

  it('Gemini jsonl：同 id 整行多次追加取最后一条；input 扣缓存、thoughts 进输出、tool 进输入', () => {
    const recs = parseGeminiFile(fx('gemini-session.jsonl'), 'proj', 'fallback-name');
    expect(recs).toHaveLength(2);
    const m1 = recs.find((r) => r.key === 'gemini:gem-sess-1:m1')!;
    expect(m1).toMatchObject({
      model: 'gemini-2.5-pro',
      input: 60 + 2,
      cacheRead: 40,
      output: 10 + 5,
      session: 'gem-sess-1',
      project: 'proj',
    });
    expect(m1.ts).toBe(Date.parse('2026-10-14T10:00:05.000Z'));
    expect(recs.find((r) => r.key.endsWith(':m2'))).toMatchObject({ input: 50, output: 7 });
  });

  it('Gemini subagent jsonl 没有头部行时用文件名当会话 id；单行 jsonl 也能解析', () => {
    const one = line({
      id: 'x1',
      timestamp: '2026-10-14T10:00:00Z',
      type: 'gemini',
      model: 'gemini-2.5-flash',
      tokens: { input: 10, output: 1, cached: 4 },
    });
    const [r] = parseGeminiFile(one, undefined, 'child-sub');
    expect(r).toMatchObject({
      key: 'gemini:child-sub:x1',
      input: 6,
      cacheRead: 4,
      session: 'child-sub',
    });
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
