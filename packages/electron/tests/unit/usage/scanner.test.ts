jest.unmock('fs');
jest.unmock('path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { UsageLedger } from '../../../src/usage/UsageLedger';
import { UsageLogScanner } from '../../../src/usage/UsageLogScanner';

const mk = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-usage-home-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-usage-root-'));
  const ledger = new UsageLedger({ root });
  let clearedAt = 0;
  let busy = false;
  const scanner = new UsageLogScanner({
    ledger,
    home,
    dshHome: path.join(home, '.dsh'),
    retention: () => '1y',
    clearedAt: () => clearedAt,
    routeBusy: () => busy,
  });
  return {
    home,
    ledger,
    scanner,
    setCleared: (n: number) => (clearedAt = n),
    setBusy: (b: boolean) => (busy = b),
  };
};

const NOW = new Date().toISOString();
const asst = (id: string, out: number, ts = NOW) =>
  `${JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    sessionId: 's1',
    cwd: '/w/app',
    message: { id, model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: out } },
  })}\n`;

const claudeFile = (home: string) => {
  const dir = path.join(home, '.claude', 'projects', '-w-app');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 's1.jsonl');
};

describe('UsageLogScanner：增量游标 + 去重', () => {
  it('首扫读入，再扫没变化不重读；追加只读新增行', async () => {
    const { home, ledger, scanner } = mk();
    const f = claudeFile(home);
    fs.writeFileSync(f, asst('msg_1', 5) + asst('msg_2', 6));
    expect((await scanner.scan()).added).toBe(2);
    expect(ledger.size()).toBe(2);
    const off = ledger.cursor(f)!.offset;
    expect(off).toBe(fs.statSync(f).size);

    expect((await scanner.scan()).added).toBe(0);
    fs.appendFileSync(f, asst('msg_3', 7));
    expect((await scanner.scan()).added).toBe(1);
    expect(ledger.size()).toBe(3);
    expect(ledger.cursor(f)!.offset).toBeGreaterThan(off);
  });

  it('半行不吞：游标停在最后一个换行，补全后再读到', async () => {
    const { home, ledger, scanner } = mk();
    const f = claudeFile(home);
    const full = asst('msg_9', 9);
    fs.writeFileSync(f, asst('msg_8', 8) + full.slice(0, 40));
    await scanner.scan();
    expect(ledger.size()).toBe(1);
    fs.appendFileSync(f, full.slice(40));
    await scanner.scan();
    expect(ledger.size()).toBe(2);
  });

  it('同一消息分多行写（token 递增）与续接会话复制旧消息：同键只记一次、取最大', async () => {
    const { home, ledger, scanner } = mk();
    const f = claudeFile(home);
    fs.writeFileSync(f, asst('msg_1', 3) + asst('msg_1', 30));
    const f2 = path.join(path.dirname(f), 's2.jsonl'); // 续接：复制了旧消息
    fs.writeFileSync(f2, asst('msg_1', 30) + asst('msg_5', 4));
    await scanner.scan();
    expect(ledger.size()).toBe(2);
    expect(ledger.all().find((r) => r.key === 'claude:msg_1')!.output).toBe(30);
  });

  it('文件被截断 / 重写后从头读', async () => {
    const { home, ledger, scanner } = mk();
    const f = claudeFile(home);
    fs.writeFileSync(f, asst('msg_1', 1) + asst('msg_2', 2) + asst('msg_3', 3));
    await scanner.scan();
    fs.writeFileSync(f, asst('msg_4', 4));
    await scanner.scan();
    expect(ledger.all().some((r) => r.key === 'claude:msg_4')).toBe(true);
  });

  it('Codex：续读靠游标里的 state（会话 id / 模型）', async () => {
    const { home, ledger, scanner } = mk();
    const dir = path.join(home, '.codex', 'sessions', '2026', '10', '14');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'rollout-x.jsonl');
    const L = (o: unknown) => `${JSON.stringify(o)}\n`;
    const tc = (total: number) =>
      L({
        timestamp: NOW,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { total_tokens: total },
            last_token_usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 5 },
          },
        },
      });
    fs.writeFileSync(
      f,
      L({ timestamp: NOW, type: 'session_meta', payload: { id: 'sid-9', cwd: '/w/p' } }) +
        L({ timestamp: NOW, type: 'turn_context', payload: { model: 'gpt-5' } }) +
        tc(55),
    );
    await scanner.scan();
    fs.appendFileSync(f, tc(110));
    await scanner.scan();
    const recs = ledger.all().filter((r) => r.source === 'codex');
    expect(recs.map((r) => r.key).sort()).toEqual(['codex:sid-9:110', 'codex:sid-9:55']);
    expect(recs.every((r) => r.model === 'gpt-5' && r.session === 'sid-9')).toBe(true);
  });

  it('走了本地路由的请求以路由记录为准：日志里同一时段的同来源记录跳过', async () => {
    const { home, ledger, scanner } = mk();
    const f = claudeFile(home);
    const ts = Date.now() - 5_000;
    ledger.upsert({
      key: 'route-1',
      ts: ts - 2_000,
      dur: 4_000,
      source: 'claude',
      via: 'route',
      model: 'deepseek-x',
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
    });
    fs.writeFileSync(
      f,
      asst('msg_routed', 5, new Date(ts).toISOString()) +
        asst('msg_direct', 5, new Date(ts - 3_600_000).toISOString()),
    );
    await scanner.scan();
    const keys = ledger.all().map((r) => r.key);
    expect(keys).toContain('claude:msg_direct');
    expect(keys).not.toContain('claude:msg_routed');
  });

  it('该来源有路由请求在飞时先不读它的日志（游标不动），结束后补读', async () => {
    const { home, ledger, scanner, setBusy } = mk();
    const f = claudeFile(home);
    fs.writeFileSync(f, asst('msg_1', 1));
    setBusy(true);
    await scanner.scan();
    expect(ledger.size()).toBe(0);
    expect(ledger.cursor(f)).toBeUndefined();
    setBusy(false);
    await scanner.scan();
    expect(ledger.size()).toBe(1);
  });

  it('一键清空之前的内容不再导入', async () => {
    const { home, ledger, scanner, setCleared } = mk();
    const f = claudeFile(home);
    const old = new Date(Date.now() - 3_600_000).toISOString();
    fs.writeFileSync(f, asst('msg_old', 1, old));
    setCleared(Date.now() - 1_000);
    fs.appendFileSync(f, asst('msg_new', 2));
    await scanner.scan();
    expect(ledger.all().map((r) => r.key)).toEqual(['claude:msg_new']);
  });

  it('检测到的工具；没有任何日志目录时不报错', async () => {
    const { home, scanner } = mk();
    expect(scanner.detected()).toEqual([]);
    expect(await scanner.scan()).toEqual({ added: 0, files: 0 });
    fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
    fs.mkdirSync(path.join(home, '.codex', 'sessions'), { recursive: true });
    expect(scanner.detected()).toEqual(['claude', 'codex']);
  });

  it('Gemini 整份 JSON：变化才重解析，重复解析不重复计数', async () => {
    const { home, ledger, scanner } = mk();
    const dir = path.join(home, '.gemini', 'tmp', 'h1', 'chats');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'session-1.json');
    const body = (n: number) =>
      JSON.stringify({
        sessionId: 'g1',
        messages: Array.from({ length: n }, (_, i) => ({
          id: `m${i}`,
          type: 'gemini',
          model: 'gemini-2.5-flash',
          timestamp: NOW,
          tokens: { input: 10, output: 5, cached: 0 },
        })),
      });
    fs.writeFileSync(f, body(1));
    await scanner.scan();
    expect(ledger.size()).toBe(1);
    fs.writeFileSync(f, body(2));
    await scanner.scan();
    expect(ledger.size()).toBe(2);
  });
});
