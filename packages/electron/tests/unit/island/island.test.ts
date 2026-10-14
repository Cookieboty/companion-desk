jest.unmock('fs');
jest.unmock('path');
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
  screen: {
    getPrimaryDisplay: () => ({
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
      workArea: { x: 0, y: 38, width: 1512, height: 944 },
      internal: true,
    }),
  },
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasNotch, islandGeometry, NOTCH_WIDTH } from '../../../src/island/geometry';
import { islandHtml } from '../../../src/island/islandPage';
import { IslandService, sanitizeIsland } from '../../../src/island/IslandService';

const notchMac = {
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  workArea: { x: 0, y: 38, width: 1512, height: 944 },
  internal: true,
};
const plainMac = { ...notchMac, workArea: { x: 0, y: 25, width: 1512, height: 957 } };
const external = { ...notchMac, internal: false };
const win = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1032 },
};

describe('island geometry', () => {
  it('detects the notch only on internal macOS displays with a tall menu bar', () => {
    expect(hasNotch('darwin', notchMac)).toBe(true);
    expect(hasNotch('darwin', plainMac)).toBe(false);
    expect(hasNotch('darwin', external)).toBe(false);
    expect(hasNotch('win32', notchMac)).toBe(false);
  });

  it('notch: flush with the top edge, collapsed = notch size; otherwise a pill below the bar', () => {
    const g = islandGeometry('darwin', notchMac);
    expect(g).toMatchObject({ mode: 'notch', y: 0, menuBarHeight: 38 });
    expect(g.collapsed).toEqual({ width: NOTCH_WIDTH, height: 38 });
    expect(g.x + g.width / 2).toBeCloseTo(756, 0);
    const p = islandGeometry('darwin', plainMac);
    expect(p).toMatchObject({ mode: 'pill', y: 33 });
    expect(islandGeometry('darwin', notchMac, 'pill').mode).toBe('pill');
    expect(islandGeometry('win32', win)).toMatchObject({ mode: 'pill', y: 8 });
  });

  it('page renders text via textContent only and has a strict CSP', () => {
    const html = islandHtml(islandGeometry('darwin', notchMac));
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('textContent');
    expect(html).not.toMatch(/innerHTML/);
  });

  it('page shows a per-endpoint badge and status icon', () => {
    const html = islandHtml(islandGeometry('darwin', notchMac));
    expect(html).toContain('id="ep"');
    expect(html).toContain("dsh: 'dsh'");
    expect(html).toContain('STATUS_ICON');
    expect(html).toContain("#icon[data-status='failed']");
  });
});

describe('IslandService policy', () => {
  const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'island-')), 'island.json');

  it('defaults: on for macOS, off for Windows/Linux', () => {
    expect(sanitizeIsland({}, 'darwin').enabled).toBe(true);
    expect(sanitizeIsland({}, 'win32').enabled).toBe(false);
    expect(sanitizeIsland({ style: 'weird' }, 'darwin').style).toBe('auto');
  });

  it('respects the toggle, per-kind switches and quiet hours (DND)', () => {
    let quiet = false;
    const s = new IslandService({ file: file(), platform: 'darwin', isQuiet: () => quiet });
    const n = { kind: 'agent' as const, title: 'Claude Code', body: 'done' };
    expect(s.accepts(n)).toBe(true);
    quiet = true;
    expect(s.accepts(n)).toBe(false);
    expect(s.accepts(n, true)).toBe(true); // 设置页「预览」
    quiet = false;
    s.set({ kinds: { message: true, agent: false, reminder: true } });
    expect(s.accepts(n)).toBe(false);
    expect(s.accepts({ ...n, kind: 'reminder' })).toBe(true);
    s.set({ enabled: false });
    expect(s.accepts({ ...n, kind: 'reminder' })).toBe(false);
    const w = new IslandService({ file: file(), platform: 'win32' });
    expect(w.accepts(n)).toBe(false);
  });
});
