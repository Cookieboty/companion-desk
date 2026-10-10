// tests/setup.ts 全局 mock 了 path，这里需要真实实现
jest.unmock('path');

import * as path from 'path';

import {
  ensureKeyServerExecutable,
  getKeyServerConfig,
  toAsarUnpackedPath,
} from '../../../src/utils/keyServerPaths';

describe('keyServerPaths', () => {
  it('maps app.asar to app.asar.unpacked (Windows and POSIX separators)', () => {
    expect(
      toAsarUnpackedPath('C:\\Program Files\\Companion Desk\\resources\\app.asar\\node_modules\\x'),
    ).toBe('C:\\Program Files\\Companion Desk\\resources\\app.asar.unpacked\\node_modules\\x');
    expect(toAsarUnpackedPath('/opt/app/resources/app.asar/node_modules/x')).toBe(
      '/opt/app/resources/app.asar.unpacked/node_modules/x',
    );
  });

  it('leaves unpackaged paths alone', () => {
    expect(toAsarUnpackedPath('/repo/node_modules/x')).toBe('/repo/node_modules/x');
  });

  it('builds per-platform server paths', () => {
    const dir = path.join(path.sep, 'r', 'app.asar', 'node_modules', 'node-global-key-listener');
    const cfg = getKeyServerConfig(dir);
    expect(cfg.windows.serverPath).toBe(
      path.join(
        path.sep,
        'r',
        'app.asar.unpacked',
        'node_modules',
        'node-global-key-listener',
        'bin',
        'WinKeyServer.exe',
      ),
    );
    expect(cfg.mac.serverPath.endsWith(path.join('bin', 'MacKeyServer'))).toBe(true);
    expect(cfg.x11.serverPath.endsWith(path.join('bin', 'X11KeyServer'))).toBe(true);
  });

  describe('ensureKeyServerExecutable', () => {
    const cfg = getKeyServerConfig('/pkg');
    it('chmods a non-executable mac server instead of falling back to sudo-prompt', () => {
      const chmod = jest.fn();
      expect(ensureKeyServerExecutable(cfg, 'darwin', chmod, () => ({ mode: 0o100644 }))).toBe(
        true,
      );
      expect(chmod).toHaveBeenCalledWith(cfg.mac.serverPath, 0o755);
    });
    it('leaves an executable server alone and skips windows', () => {
      const chmod = jest.fn();
      expect(ensureKeyServerExecutable(cfg, 'linux', chmod, () => ({ mode: 0o100755 }))).toBe(true);
      expect(ensureKeyServerExecutable(cfg, 'win32', chmod, () => ({ mode: 0 }))).toBe(true);
      expect(chmod).not.toHaveBeenCalled();
    });
    it('reports false when chmod fails', () => {
      const chmod = () => {
        throw new Error('EPERM');
      };
      expect(ensureKeyServerExecutable(cfg, 'darwin', chmod, () => ({ mode: 0o644 }))).toBe(false);
    });
  });
});
