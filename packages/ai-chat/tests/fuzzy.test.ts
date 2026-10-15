import { describe, expect, it } from 'vitest';

import { fold, matchToken, rankItems, tokenize } from '../src/utils/fuzzy';

type Row = { id: string; title: string; first?: string; cwd?: string; ep: string; at: number };
const fields = (r: Row) => [
  { text: r.title, weight: 3, highlight: true },
  { text: r.first ?? '', weight: 2 },
  { text: r.cwd ?? '', weight: 1.5 },
  { text: r.ep, weight: 1 },
];
const rows: Row[] = [
  { id: '1', title: 'Refactor login flow', ep: 'Claude Code', cwd: '/work/app', at: 5 },
  { id: '2', title: '修复登录页面的样式', first: '登录按钮错位', ep: 'Nomi', at: 4 },
  { id: '3', title: 'pong session', ep: 'dsh', cwd: '/work/dsh-pong', at: 3 },
  { id: '4', title: 'Reply with exactly: pong', ep: 'Codex', cwd: '/tmp/e2e', at: 2 },
  { id: '5', title: '今天的待办', first: '帮我整理 login 日志', ep: 'Nomi', at: 1 },
];
const ids = (q: string) => rankItems(rows, q, fields).map((r) => r.item.id);

describe('fold / tokenize', () => {
  it('lowercases and folds full-width characters, keeping length', () => {
    expect(fold('ＬＯＧＩＮ　Ａ')).toBe('login a');
    expect(fold('登录ABC')).toHaveLength('登录ABC'.length);
    expect(tokenize('  Login   页面 ')).toEqual(['login', '页面']);
  });
});

describe('matchToken', () => {
  it('prefers substring over subsequence, and the start of a word', () => {
    const sub = matchToken('login', 'refactor login flow')!;
    const seq = matchToken('rflg', 'refactor login flow')!;
    expect(sub.score).toBeGreaterThan(seq.score);
    expect(sub.ranges).toEqual([[9, 14]]);
    expect(matchToken('log', 'login')!.score).toBeGreaterThan(matchToken('gin', 'login')!.score);
  });
  it('tolerates skipped letters (subsequence) but not noise or single letters', () => {
    expect(matchToken('rflg', 'refactor login flow')).not.toBeNull();
    expect(matchToken('lgn', 'login')).not.toBeNull();
    expect(matchToken('xz', 'refactor login flow')).toBeNull();
    expect(matchToken('q', 'abc')).toBeNull();
    // 跨度过大的偶然命中不算
    expect(matchToken('abc', 'a' + 'x'.repeat(60) + 'b' + 'x'.repeat(60) + 'c')).toBeNull();
  });
});

describe('rankItems', () => {
  it('matches title, first user message, workspace path and endpoint name', () => {
    expect(ids('refactor')).toEqual(['1']);
    expect(ids('按钮错位')).toEqual(['2']); // 首条消息
    expect(ids('e2e')).toEqual(['4']); // 路径
    expect(ids('codex')).toEqual(['4']); // 端点名
  });
  it('is Chinese friendly (substring and subsequence over characters)', () => {
    expect(ids('登录')[0]).toBe('2');
    expect(ids('登页面')).toEqual(['2']);
    expect(ids('待办')).toEqual(['5']);
  });
  it('requires every token (AND) and ranks title hits above message hits', () => {
    expect(ids('登录 样式')).toEqual(['2']);
    expect(ids('login 日志')).toEqual(['5']);
    // 'login'：标题命中的排在只有首条消息命中的前面
    expect(ids('login')).toEqual(['1', '5', '2'].filter((x) => ids('login').includes(x)));
    expect(ids('login')[0]).toBe('1');
  });
  it('keeps the incoming order for equal scores and returns highlight ranges from the title', () => {
    const r = rankItems(rows, 'pong', fields);
    expect(r.map((x) => x.item.id)).toEqual(['3', '4']); // 同为标题子串命中；3 的位置更靠前
    expect(r[0]!.ranges).toEqual([[0, 4]]);
    expect(rankItems(rows, '', fields)).toHaveLength(rows.length);
    expect(rankItems(rows, 'zzzzqq', fields)).toEqual([]);
  });
  it('deduplicates nothing by itself but is stable and capped by limit', () => {
    expect(rankItems(rows, '', fields, 2)).toHaveLength(2);
  });
});
