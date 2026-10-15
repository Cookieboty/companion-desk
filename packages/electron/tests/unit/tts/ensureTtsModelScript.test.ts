jest.unmock('fs');
jest.unmock('path');

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SHERPA_ARCHIVE_BYTES,
  SHERPA_ARCHIVE_SHA256,
  SHERPA_MODEL_ID,
  SHERPA_MODEL_URL,
  SHERPA_REQUIRED_FILES,
} from '../../../src/tts/sherpa/manifest';

const script = path.resolve(__dirname, '../../../scripts/ensure-tts-model.mjs');
const src = fs.readFileSync(script, 'utf8');

describe('scripts/ensure-tts-model.mjs', () => {
  it('manifest constants stay in sync with src/tts/sherpa/manifest.ts', () => {
    expect(src).toContain(`const MODEL_ID = '${SHERPA_MODEL_ID}'`);
    expect(src).toContain(SHERPA_MODEL_URL);
    expect(src).toContain(`const MODEL_SHA256 = '${SHERPA_ARCHIVE_SHA256}'`);
    expect(src).toContain(`const MODEL_BYTES = ${SHERPA_ARCHIVE_BYTES}`);
    const block = src.slice(src.indexOf('const REQUIRED = '), src.indexOf('const args = '));
    const files: Record<string, number> = {};
    for (const m of block.matchAll(/'([^']+)':\s*(\d+)/g)) files[m[1]!] = Number(m[2]);
    expect(files).toEqual(SHERPA_REQUIRED_FILES);
  });

  it('NOMI_SKIP_TTS_MODEL=1 skips without touching anything and exits 0', () => {
    const out = execFileSync(process.execPath, [script], {
      env: { ...process.env, NOMI_SKIP_TTS_MODEL: '1' },
      encoding: 'utf8',
    });
    expect(out).toMatch(/NOMI_SKIP_TTS_MODEL=1/);
  });

  it('is wired into postinstall and dev', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.postinstall).toMatch(/ensure-tts-model\.mjs/);
    const dev = fs.readFileSync(path.resolve(__dirname, '../../../scripts/dev.mjs'), 'utf8');
    expect(dev).toMatch(/ensure-tts-model\.mjs/);
    void os;
  });
});
