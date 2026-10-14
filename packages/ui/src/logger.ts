/* eslint-disable no-console -- 集中日志：唯一允许直接调用 console 的地方 */
/**
 * 渲染进程集中日志。
 *
 * - debug / info：只在开发环境输出（页面经 Vite dev server 以 http(s) 加载），
 *   打包后（file:// 加载）静默；排查线上问题可在 DevTools 执行
 *   `localStorage.setItem('nomi.debug', '1')` 后刷新打开。
 * - warn / error：始终输出。
 * - perf：启动测速打点（scripts/measure-startup.mjs、dev:smoke 依赖），始终输出一行。
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

let override: boolean | null = null;

/** 测试 / 调试用：强制开关 debug/info 输出（null 恢复自动判断） */
export function setVerboseLogging(on: boolean | null): void {
  override = on;
}

export function isVerboseLogging(): boolean {
  if (override !== null) return override;
  try {
    if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('nomi.debug') === '1';
  } catch {
    return false;
  }
}

export function createLogger(scope: string): Logger {
  const p = `[${scope}]`;
  return {
    debug: (...a) => {
      if (isVerboseLogging()) console.debug(p, ...a);
    },
    info: (...a) => {
      if (isVerboseLogging()) console.info(p, ...a);
    },
    warn: (...a) => console.warn(p, ...a),
    error: (...a) => console.error(p, ...a),
  };
}

/** 启动测速打点：`[perf] <name>`（测速脚本按这个前缀解析） */
export function perfMark(name: string, ...detail: unknown[]): void {
  console.info(`[perf] ${name}`, ...detail);
}
