jest.unmock('fs');
jest.unmock('path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createSystemEvent,
  jxaReadScript,
  outlookCreateScript,
  readSystemCalendar,
  systemCalendarInfo,
} from '../../../src/local/systemCalendar';

jest.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  dialog: {},
  ipcMain: { handle: jest.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  BrowserWindow: { getAllWindows: () => [] },
  clipboard: {},
  nativeImage: {},
}));

describe('system calendar', () => {
  it('provider per platform', () => {
    expect(systemCalendarInfo('darwin')).toEqual({ provider: 'macos-calendar', canCreate: true });
    expect(systemCalendarInfo('win32').provider).toBe('outlook-com');
    expect(systemCalendarInfo('linux')).toEqual({ provider: 'evolution', canCreate: false });
  });

  it('macOS: runs JXA through osascript and maps events', async () => {
    const run = jest.fn(async (_c: string, _a: string[], _t: number) =>
      JSON.stringify([
        { uid: 'A', summary: '站会', start: 1000, end: 2000, allDay: false, calendar: 'Work' },
        { uid: 'B', summary: '', start: 3000, end: 2500 },
        { summary: 'no uid', start: 1, end: 2 },
      ]),
    );
    const ev = await readSystemCalendar({ platform: 'darwin', from: 0, to: 9, cal: 'system', run });
    expect(run.mock.calls[0][0]).toBe('osascript');
    expect(run.mock.calls[0][1].slice(0, 2)).toEqual(['-l', 'JavaScript']);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ uid: 'system:A', summary: '站会', cal: 'system' });
    expect(ev[1].end).toBe(3000); // end 不早于 start
    expect(jxaReadScript(0, 1)).toContain("Application('Calendar')");
  });

  it('Windows: Outlook COM returns a single object or array', async () => {
    const run = jest.fn(async (_c: string, _a: string[], _t: number) =>
      JSON.stringify({ uid: 'X', summary: 'Sync', start: 5, end: 6 }),
    );
    const ev = await readSystemCalendar({ platform: 'win32', from: 0, to: 9, cal: 'system', run });
    expect(run.mock.calls[0][0]).toBe('powershell.exe');
    expect(ev).toHaveLength(1);
    expect(outlookCreateScript({ summary: "it's", start: 0, end: 1 })).toContain("'it''s'");
  });

  it('Linux: reads Evolution local calendar.ics', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'evo-'));
    const dir = path.join(home, '.local', 'share', 'evolution', 'calendar', 'system');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'calendar.ics'),
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:e1\r\nSUMMARY:Dentist\r\nDTSTART:20261020T090000Z\r\nDTEND:20261020T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
    );
    const ev = await readSystemCalendar({ platform: 'linux', from: 0, to: 9, cal: 'system', home });
    expect(ev.map((e) => e.summary)).toEqual(['Dentist']);
    await expect(
      readSystemCalendar({
        platform: 'linux',
        from: 0,
        to: 9,
        cal: 's',
        home: os.tmpdir() + '/none',
      }),
    ).rejects.toThrow(/evolution/);
    await expect(
      createSystemEvent({ platform: 'linux', summary: 'x', start: 0, end: 1 }),
    ).rejects.toThrow();
  });

  it('friendly errors for denied automation / missing Outlook', async () => {
    const { systemCalendarError } = await import('../../../src/local/LocalHubService');
    expect(
      systemCalendarError(
        'execution error: Not authorized to send Apple events to Calendar. (-1743)',
      ),
    ).toMatch(/自动化/);
    expect(systemCalendarError('Retrieving the COM class factory ... 80040154')).toMatch(/Outlook/);
  });
});
