jest.unmock('fs');
jest.unmock('path');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  builtinAssetsRoots,
  clearBuiltinReferenceCache,
  loadBuiltinReference,
  resolveBuiltinReferencePaths,
  sanitizeReferenceId,
} from '../../../src/tts/fish/builtinReference';

describe('builtinReference', () => {
  afterEach(() => clearBuiltinReferenceCache());

  it('sanitizeReferenceId falls back to nomi', () => {
    expect(sanitizeReferenceId('nomi')).toBe('nomi');
    expect(sanitizeReferenceId('../evil')).toBe('nomi');
  });

  it('builtinAssetsRoots includes packaged and monorepo candidates', () => {
    const roots = builtinAssetsRoots({
      dirname: '/app/dist/tts/fish',
      appPath: '/app',
      resourcesPath: '/Resources',
      cwd: '/repo',
    });
    expect(
      roots.some((r) => r.endsWith(`${path.sep}assets`) || r.includes(`${path.sep}assets`)),
    ).toBe(true);
    expect(roots).toEqual(
      expect.arrayContaining([
        path.normalize('/app/assets'),
        path.normalize('/Resources/assets'),
        path.normalize('/repo/packages/electron/assets'),
      ]),
    );
  });

  it('loads real nomi sample from repo assets', () => {
    const repoRoot = path.resolve(__dirname, '../../../../../');
    const roots = [path.join(repoRoot, 'packages/electron/assets')];
    const paths = resolveBuiltinReferencePaths('nomi', { roots });
    expect(paths).not.toBeNull();
    expect(fs.existsSync(paths!.wavPath)).toBe(true);

    const ref = loadBuiltinReference('nomi', { roots, noCache: true });
    expect(ref).not.toBeNull();
    expect(ref!.id).toBe('nomi');
    expect(ref!.audioBase64.length).toBeGreaterThan(1000);
    expect(ref!.referenceText.length).toBeGreaterThan(0);
  });

  it('returns null when seed missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-tts-'));
    const ref = loadBuiltinReference('nomi', { roots: [dir], noCache: true });
    expect(ref).toBeNull();
  });
});
