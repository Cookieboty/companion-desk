import { describe, expect, it } from 'vitest';

import { dedupeHistory } from '../src/hooks/useCliHistory';
import type { HistorySession } from '../src/services/historyClient';

const h = (key: string, updatedAt: number, title = key): HistorySession =>
  ({
    key,
    backend: key.split(':')[0],
    sessionId: key.split(':')[1],
    title,
    updatedAt,
  }) as HistorySession;

describe('dedupeHistory', () => {
  it('keeps one row per key, the one with the newest updatedAt, in first-seen order', () => {
    const out = dedupeHistory([
      h('codex:a', 1, 'old'),
      h('codex:b', 5),
      h('codex:a', 9, 'new'),
      h('claude:a', 2),
    ]);
    expect(out.map((x) => x.key)).toEqual(['codex:a', 'codex:b', 'claude:a']);
    expect(out[0]!.title).toBe('new');
    expect(new Set(out.map((x) => x.key)).size).toBe(out.length);
  });
});
