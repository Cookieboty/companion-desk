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
