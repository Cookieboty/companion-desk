import * as fs from 'fs';
import * as path from 'path';

/**
 * 把 app.asar 内的路径映射到 app.asar.unpacked（electron-builder asarUnpack 的落点）。
 * 原生可执行文件（如 node-global-key-listener 的 WinKeyServer.exe）无法从 asar 内直接启动。
 */
export function toAsarUnpackedPath(p: string): string {
  return p.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

export interface KeyServerConfig {
  windows: { serverPath: string };
  mac: { serverPath: string };
  x11: { serverPath: string };
}

/**
 * node-global-key-listener 各平台 key server 的绝对路径（打包后指向 asar.unpacked）。
 * @param packageDir node-global-key-listener 包根目录
 */
export function getKeyServerConfig(packageDir: string): KeyServerConfig {
  const bin = (name: string) => toAsarUnpackedPath(path.join(packageDir, 'bin', name));
  return {
    windows: { serverPath: bin('WinKeyServer.exe') },
    mac: { serverPath: bin('MacKeyServer') },
    x11: { serverPath: bin('X11KeyServer') },
  };
}

/**
 * pnpm 解压的 key server 没有可执行位（0644）。node-global-key-listener 遇到 EACCES 时会回退到
 * sudo-prompt 去 `chmod +x`，而 sudo-prompt 9 调用了 Node 23+ 已删除的 `util.isObject`，
 * 在 Electron 44（Node 24）上直接抛出 “Node.util.isObject is not a function”。
 * 这里在启动前自己补上可执行位（文件属于当前用户，不需要 sudo）。失败时静默（例如只读的安装目录）。
 */
export function ensureKeyServerExecutable(
  cfg: KeyServerConfig,
  platform: NodeJS.Platform = process.platform,
  chmod: (p: string, mode: number) => void = (p, m) => fs.chmodSync(p, m),
  stat: (p: string) => { mode: number } = (p) => fs.statSync(p),
): boolean {
  if (platform === 'win32') return true;
  const p = platform === 'darwin' ? cfg.mac.serverPath : cfg.x11.serverPath;
  try {
    if ((stat(p).mode & 0o111) === 0o111) return true;
    chmod(p, 0o755);
    return true;
  } catch {
    return false;
  }
}
