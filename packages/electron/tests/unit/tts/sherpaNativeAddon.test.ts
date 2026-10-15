jest.unmock('fs');
jest.unmock('path');

import path from 'node:path';

import {
  SherpaAddonLoadError,
  loadSherpaAddon,
  platformPackageName,
  toUnpackedPath,
} from '../../../src/tts/sherpa/nativeAddon';

describe('nativeAddon', () => {
  it('maps platform package names (win32 → win)', () => {
    expect(platformPackageName('win32', 'x64')).toBe('sherpa-onnx-win-x64');
    expect(platformPackageName('linux', 'x64')).toBe('sherpa-onnx-linux-x64');
    expect(toUnpackedPath('C:\\app\\resources\\app.asar\\node_modules\\x')).toContain(
      'app.asar.unpacked',
    );
    expect(toUnpackedPath('/a/app.asar.unpacked/x')).toBe('/a/app.asar.unpacked/x');
  });

  it('returns the addon and prepends the win-x64 package dir to PATH', () => {
    const addon = { OfflineTts: {} };
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\Windows\\System32' };
    const dir = path.join('C:\\x', 'node_modules', 'sherpa-onnx-win-x64');
    const r = loadSherpaAddon({
      platform: 'win32',
      arch: 'x64',
      env,
      requireAddon: () => addon,
      resolvePkgJson: (pkg) => path.join(dir, `${pkg}.json`),
      exists: () => true,
    });
    expect(r).toBe(addon);
    expect(env.PATH!.startsWith(dir)).toBe(true);
  });

  it('unsupported platform → clear error', () => {
    expect(() => loadSherpaAddon({ platform: 'win32', arch: 'arm64' })).toThrow(
      /不支持当前平台 win32-arm64/,
    );
  });

  it('missing platform package (win-x64) → actionable pnpm install hint', () => {
    try {
      loadSherpaAddon({
        platform: 'win32',
        arch: 'x64',
        env: {},
        requireAddon: () => {
          throw new Error('Could not find sherpa-onnx-node');
        },
        resolvePkgJson: () => {
          throw new Error("Cannot find module 'sherpa-onnx-win-x64/package.json'");
        },
      });
      throw new Error('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SherpaAddonLoadError);
      expect((e as Error).message).toMatch(/sherpa-onnx-win-x64/);
      expect((e as Error).message).toMatch(/pnpm install/);
    }
  });

  it('dlopen failure surfaces the real error + VC++ / System32 onnxruntime hints on Windows', () => {
    const dir = 'C:\\x\\sherpa-onnx-win-x64';
    try {
      loadSherpaAddon({
        platform: 'win32',
        arch: 'x64',
        env: {},
        requireAddon: () => {
          throw new Error('Could not find sherpa-onnx-node');
        },
        resolvePkgJson: (pkg) => `${dir}\\${pkg}.json`,
        exists: () => true,
        readdir: () => ['sherpa-onnx.node', 'onnxruntime.dll', 'sherpa-onnx-c-api.dll'],
        requireNode: () => {
          throw new Error('The specified module could not be found. VCRUNTIME140_1.dll');
        },
      });
      throw new Error('should throw');
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toMatch(/dlopen\(.*sherpa-onnx\.node\) 实际错误：The specified module/);
      expect(m).toMatch(/Visual C\+\+/);
      expect(m).toMatch(/System32/);
    }
  });

  it('reports missing DLLs in the platform package', () => {
    expect(() =>
      loadSherpaAddon({
        platform: 'win32',
        arch: 'x64',
        env: {},
        requireAddon: () => {
          throw new Error('nope');
        },
        resolvePkgJson: (pkg) => `C:\\p\\${pkg}.json`,
        exists: () => true,
        readdir: () => ['sherpa-onnx.node'],
        requireNode: () => ({}),
      }),
    ).toThrow(/缺少 DLL：onnxruntime\.dll, sherpa-onnx-c-api\.dll/);
  });
});
