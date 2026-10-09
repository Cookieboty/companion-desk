jest.unmock('path');
jest.unmock('fs');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { migrateLegacyUserData } from '../../../src/utils/legacyUserData';

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
    const target = path.join(appData, 'Companion Desk');

    const res = migrateLegacyUserData(appData, target);

    expect(res).toEqual({ migrated: true, from: legacy, to: target });
    expect(fs.readFileSync(path.join(target, 'ai-chat', 'x.json'), 'utf8')).toBe('{"a":1}');
    expect(fs.existsSync(legacy)).toBe(true);
  });

  it('does nothing when the new directory already exists', () => {
    fs.mkdirSync(path.join(appData, '智能小助手'));
    const target = path.join(appData, 'Companion Desk');
    fs.mkdirSync(target);
    expect(migrateLegacyUserData(appData, target).migrated).toBe(false);
  });

  it('does nothing without a legacy directory', () => {
    const target = path.join(appData, 'Companion Desk');
    expect(migrateLegacyUserData(appData, target).migrated).toBe(false);
    expect(fs.existsSync(target)).toBe(false);
  });
});
