import { parseIcs, expand, toIcs, extractCalendarData, caldavQuery } from '../../../src/local/ics';
import {
  LOCAL_LLMS,
  LLAMA_RUNTIME,
  fitLevel,
  recommend,
  runtimeFor,
  serverArgs,
} from '../../../src/local/llmCatalog';
import { looksSecret } from '../../../src/local/LocalHubService';

describe('llmCatalog', () => {
  it('只收录宽松许可证、带校验值的模型', () => {
    for (const m of LOCAL_LLMS) {
      expect(['Apache-2.0', 'MIT']).toContain(m.license);
      expect(m.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(m.bytes).toBeGreaterThan(1e8);
      expect(m.url).toMatch(/^https:\/\/huggingface\.co\/.+\.gguf$/);
      expect(m.family).not.toMatch(/llama|gemma/i);
    }
    expect(LLAMA_RUNTIME.license).toBe('MIT');
    for (const a of LLAMA_RUNTIME.assets) expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('按内存推荐', () => {
    expect(recommend(2).id).toBe(LOCAL_LLMS[0].id);
    const big = recommend(64);
    expect(big.minRamGb).toBeLessThanOrEqual(64);
    expect(recommend(8).minRamGb).toBeLessThanOrEqual(8);
    expect(recommend(8).minRamGb).toBeGreaterThanOrEqual(recommend(4).minRamGb);
  });
  it('fitLevel', () => {
    const m = { ...LOCAL_LLMS[0], minRamGb: 8 };
    expect(fitLevel(m, 16)).toBe('ok');
    expect(fitLevel(m, 6)).toBe('tight');
    expect(fitLevel(m, 4)).toBe('too-big');
  });
  it('运行时平台与参数', () => {
    expect(runtimeFor('linux', 'x64')?.archive).toBe('tar.gz');
    expect(runtimeFor('win32', 'x64')?.archive).toBe('zip');
    expect(runtimeFor('freebsd', 'x64')).toBeNull();
    const a = serverArgs({ model: '/m.gguf', port: 1234, ctx: 4096, threads: 4 });
    expect(a).toEqual(expect.arrayContaining(['--host', '127.0.0.1', '--port', '1234', '-t', '4']));
  });
});

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:a1',
  'SUMMARY:周会',
  'DTSTART:20261012T020000Z',
  'DTEND:20261012T030000Z',
  'RRULE:FREQ=WEEKLY;COUNT=3',
  'LOCATION:会议室',
  ' A',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:a2',
  'SUMMARY:国庆',
  'DTSTART;VALUE=DATE:20261013',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('ics', () => {
  it('解析 + 折行 + 全天', () => {
    const ev = parseIcs(ICS, 'c');
    expect(ev).toHaveLength(2);
    expect(ev[0].summary).toBe('周会');
    expect(ev[0].location).toBe('会议室A');
    expect(ev[1].allDay).toBe(true);
  });
  it('展开每周重复（COUNT）', () => {
    const ev = parseIcs(ICS, 'c');
    const from = Date.UTC(2026, 9, 1);
    const occ = expand(ev, from, from + 60 * 86_400_000).filter((o) => o.uid === 'a1');
    expect(occ).toHaveLength(3);
    expect(occ[1].start - occ[0].start).toBe(7 * 86_400_000);
  });
  it('往返导出', () => {
    const ev = parseIcs(ICS, 'c');
    const back = parseIcs(toIcs(ev), 'c');
    expect(back.map((e) => e.summary)).toEqual(['周会', '国庆']);
  });
  it('CalDAV 报文', () => {
    expect(caldavQuery(0, 86_400_000)).toContain('calendar-query');
    const xml = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><c:calendar-data>BEGIN:VCALENDAR&#13;
END:VCALENDAR</c:calendar-data></d:response></d:multistatus>`;
    expect(extractCalendarData(xml)[0]).toContain('BEGIN:VCALENDAR');
  });
});

describe('剪贴板过滤', () => {
  it('跳过密钥', () => {
    expect(looksSecret('sk-abcdefghijklmnopqrstuvwx')).toBe(true);
    expect(looksSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(looksSecret('今天下午三点开会')).toBe(false);
  });
});
