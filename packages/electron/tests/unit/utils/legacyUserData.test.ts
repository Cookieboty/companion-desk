jest.unmock('path');
jest.unmock('fs');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LEGACY_DEV_NAMES, migrateLegacyUserData } from '../../../src/utils/legacyUserData';

describe('migrateLegacyUserData', () => {
  let appData: string;
  beforeEach(() => {
    appData = fs.mkdtempSync(path.join(os.tmpdir(), 'appdata-'));
  });
  afterEach(() => {
    fs.rmSync(appData, { recursive: true, force: true });
  });

  it('copies the legacy product directory when the new one does not exist', () => {
    const legacy = path.join(appData, '智能小助手');
    fs.mkdirSync(path.join(legacy, 'ai-chat'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'ai-chat', 'x.json'), '{"a":1}');
    const target = path.join(appData, 'Nomi');

    const res = migrateLegacyUserData(appData, target);

    expect(res).toEqual({ migrated: true, from: legacy, to: target });
    expect(fs.readFileSync(path.join(target, 'ai-chat', 'x.json'), 'utf8')).toBe('{"a":1}');
    expect(fs.existsSync(legacy)).toBe(true);
  });

  it('does nothing when the new directory already holds app data', () => {
    fs.mkdirSync(path.join(appData, '智能小助手'));
    const target = path.join(appData, 'Nomi');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'ai-providers.json'), '{}');
    expect(migrateLegacyUserData(appData, target).migrated).toBe(false);
  });

  it('does nothing without a legacy directory', () => {
    const target = path.join(appData, 'Nomi');
    expect(migrateLegacyUserData(appData, target).migrated).toBe(false);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('prefers the most recent product name (Companion Desk) over older ones', () => {
    fs.mkdirSync(path.join(appData, '智能小助手'));
    const cd = path.join(appData, 'Companion Desk');
    fs.mkdirSync(cd);
    fs.writeFileSync(path.join(cd, 'settings.json'), '{"theme":"ink"}');
    const target = path.join(appData, 'Nomi');
    const res = migrateLegacyUserData(appData, target);
    expect(res).toEqual({ migrated: true, from: cd, to: target });
    expect(fs.readFileSync(path.join(target, 'settings.json'), 'utf8')).toBe('{"theme":"ink"}');
  });

  it('migrates the dev directory (@ig-live/electron) when names are passed', () => {
    const dev = path.join(appData, '@ig-live', 'electron');
    fs.mkdirSync(dev, { recursive: true });
    const target = path.join(appData, '@nomi-ai', 'electron');
    expect(migrateLegacyUserData(appData, target, LEGACY_DEV_NAMES).from).toBe(dev);
  });

  it('still migrates when Chromium already created boot-only entries (Crashpad)', () => {
    const cd = path.join(appData, 'Companion Desk');
    fs.mkdirSync(cd);
    fs.writeFileSync(path.join(cd, 'ai-providers.json'), '{}');
    const target = path.join(appData, 'Nomi');
    fs.mkdirSync(path.join(target, 'Crashpad'), { recursive: true });
    expect(migrateLegacyUserData(appData, target).migrated).toBe(true);
    expect(fs.existsSync(path.join(target, 'ai-providers.json'))).toBe(true);
  });
});
