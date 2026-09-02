import { describe, expect, it } from 'vitest';

import { migrateLegacyHistory, serializeSessionFile } from '../lib/migrate/history';
import type { LegacyChatMessage } from '../lib/migrate/types';

const now = 1_700_000_000_000;

const FIXTURE: LegacyChatMessage[] = [
  { id: 'm1', role: 'user', content: 'hi', timestamp: now, sessionId: 'chat/abc' },
  {
    id: 'm2',
    role: 'assistant',
    content: 'hello',
    timestamp: now + 1000,
    sessionId: 'chat/abc',
    modelId: 'deepseek-main',
  },
  { id: 'm3', role: 'user', content: 'ok', timestamp: now + 5000 }, // no sessionId
  { id: 'm4', role: 'system', content: 'welcome', timestamp: now - 500, sessionId: 'chat/xyz' },
];

describe('migrateLegacyHistory', () => {
  it('按 sessionId 拆分并保留时间序', () => {
    const r = migrateLegacyHistory(FIXTURE);
    expect(r.skipped).toEqual([]);
    expect(r.sessions.map((s) => s.sessionId)).toEqual([
      'chat_abc', // 特殊字符被 safe 化
      'chat_xyz',
      'legacy',
    ]);

    const abc = r.sessions[0];
    expect(abc.file).toBe('chat_abc.jsonl');
    expect(abc.records.map((r) => r.id)).toEqual(['m1', 'm2']);
    expect(abc.createdAt).toBe(now);
    expect(abc.updatedAt).toBe(now + 1000);
    expect(abc.records[1].modelId).toBe('deepseek-main');
  });

  it('允许自定义 fallbackSessionId', () => {
    const r = migrateLegacyHistory([{ id: 'x', role: 'user', content: 'hey', timestamp: now }], {
      fallbackSessionId: 'default',
    });
    expect(r.sessions[0].sessionId).toBe('default');
  });

  it('对无效条目走 skipped', () => {
    const r = migrateLegacyHistory([
      { id: '', role: 'user', content: 'oops', timestamp: now } as unknown as LegacyChatMessage,
      { id: 'no-ts', role: 'user', content: 'oops' } as unknown as LegacyChatMessage,
      // @ts-expect-error 故意非法 role
      { id: 'bad-role', role: 'foo', content: 'x', timestamp: now },
      'not-an-object' as unknown as LegacyChatMessage,
    ]);
    expect(r.sessions).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      'missing id',
      'missing timestamp',
      'invalid role "foo"',
      'not an object',
    ]);
  });

  it('serializeSessionFile 输出为 JSONL（每行 JSON + 末尾换行）', () => {
    const r = migrateLegacyHistory(FIXTURE);
    const jsonl = serializeSessionFile(r.sessions[0]);
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.id).toMatch(/^m\d$/);
    }
    expect(jsonl.endsWith('\n')).toBe(true);
  });

  it('空输入产出空 sessions', () => {
    const r = migrateLegacyHistory([]);
    expect(r.sessions).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});
