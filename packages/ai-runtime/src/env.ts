/**
 * 主进程守卫：ai-runtime 只能在 Electron 主进程加载。
 *
 * 主进程判定：`process.versions.electron` 存在，且 `process.type` 是 `'browser'`
 * 或 `undefined`（在 Electron main / Node harness 两种情况下都合法）。
 *
 * `skipInTest` 仅供 vitest 桩测试内使用；生产运行时**必须**保持 false。
 */
export interface AssertMainProcessOptions {
  skipInTest?: boolean;
}

export function assertElectronMainProcess(opts: AssertMainProcessOptions = {}): void {
  if (opts.skipInTest && process.env.VITEST) return;

  const proc = process as NodeJS.Process & { type?: string; versions: NodeJS.ProcessVersions };
  const hasElectron = Boolean(proc.versions?.electron);
  const isMain = proc.type === 'browser' || proc.type === undefined;

  if (!hasElectron) {
    throw new Error(
      '[@ig-live/ai-runtime] must be loaded inside Electron main process ' +
        '(process.versions.electron is undefined).',
    );
  }
  if (!isMain) {
    throw new Error(
      '[@ig-live/ai-runtime] must be loaded inside Electron main process ' +
        `(process.type === '${proc.type}').`,
    );
  }
}
