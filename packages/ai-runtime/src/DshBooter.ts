/**
 * DshBooter —— 生产环境的 `Booter` 实现。
 *
 * 两段式装配：
 * 1. **dsh 内核**：`@deepseek-ai/dsh` 包本身是 CLI（没有 `"."` 导出、也没有 `boot()`），
 *    真正的启动 API 在 `@deepseek-ai/dsh-app-boot`：`loadProfile()` 读取
 *    `<home>/profiles/<name>`（bundle layers + profile patch），`boot()` 用一份空的根
 *    `cordis.yml` + 这些 patch 拉起 cordis 树。dsh 需要 Node ≥ 22（Electron ≥ 34）。
 * 2. **ig 插件宿主**：`@ig-live/bundle-ig-*` 不是 cordis bundle，由
 *    [IgPluginHost](./IgPluginHost.ts) 按清单 apply，得到 AIClient 使用的 `PluginContext`。
 *    dsh 内核 context 以 `ctx.dsh` 挂在宿主上，供后续桥接。
 *
 * 内核模式（`core` 选项或 `IG_DSH_CORE` 环境变量）：
 * - `off`（默认）：跳过 dsh 内核，仅启动 IgPluginHost（生产路径）；
 * - `auto`：能解析 dsh 就启动；失败只告警，ig 宿主照常工作；
 * - `required`：内核启动失败即抛错（doctor / 实验用）。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { UserProfileKey, type PluginContext } from '@ig-live/bundle-ig-base';

import type { Booter, StartOptions } from './AIRuntimeService';
import { createIgPluginHost, type IgPluginEntry, type IgPluginHost } from './IgPluginHost';
import { defaultIgPlugins } from './igPlugins';
import { ConsoleRuntimeLogger, type RuntimeLogger } from './logger';

export type DshCoreMode = 'auto' | 'required' | 'off';

export interface DshBooterOptions {
  /**
   * `@deepseek-ai/dsh/package.json` 的绝对路径（dsh 安装锚点）。
   * 默认从本包位置 `require.resolve`。
   */
  installAnchor?: string;
  /** dsh 内核模式，默认取 `IG_DSH_CORE`，再默认 `off` */
  core?: DshCoreMode;
  /** profile → ig 插件清单，默认 [defaultIgPlugins](./igPlugins.ts) */
  plugins?: (profile: string) => IgPluginEntry[];
  /** 根 `cordis.yml` 所在临时目录的父目录，默认 `os.tmpdir()` */
  stateDir?: string;
  logger?: RuntimeLogger;
}

/** dsh-app-boot 中本模块用到的最小 API 面 */
interface DshAppBoot {
  loadProfile(
    binName: string,
    name: string,
    installAnchor: string,
    home?: string,
  ): { dir: string; layers: { packageName: string; patches: unknown[] }[]; patches: unknown[] };
  boot(
    binName: string,
    absoluteConfigPath: string,
    patches?: unknown[],
    prepare?: (ctx: unknown) => void | Promise<void>,
    bareModuleBaseUrl?: string,
  ): Promise<DshCoreContext>;
}

export interface DshCoreContext {
  fiber?: { dispose(): Promise<unknown> | unknown };
}

function resolveCoreMode(opt: DshCoreMode | undefined): DshCoreMode {
  // Production default is off (IgPluginHost + AI SDK). Set IG_DSH_CORE=required|auto
  // only for doctor / experimental harness work when optional @deepseek-ai/dsh* are installed.
  const raw = opt ?? process.env.IG_DSH_CORE ?? 'off';
  return raw === 'required' || raw === 'auto' ? raw : 'off';
}

export function createDshBooter(opts: DshBooterOptions = {}): Booter {
  const req = createRequire(typeof __filename !== 'undefined' ? __filename : process.cwd() + '/');
  const logger = opts.logger ?? ConsoleRuntimeLogger;
  const pluginsFor = opts.plugins ?? ((profile: string) => defaultIgPlugins(profile));

  let host: IgPluginHost | undefined;
  let core: DshCoreContext | undefined;
  let rootDir: string | undefined;

  async function bootCore(profile: string, home: string): Promise<DshCoreContext> {
    if (typeof (Promise as { withResolvers?: unknown }).withResolvers !== 'function') {
      throw new Error(
        `dsh requires Node >= 22 (running ${process.versions.node}); upgrade Electron to >= 34`,
      );
    }
    const installAnchor = opts.installAnchor ?? req.resolve('@deepseek-ai/dsh/package.json');
    // dsh-app-boot 是纯 ESM；从 dsh 安装锚点解析，保证与 dsh 版本一致
    const appBootPath = createRequire(installAnchor).resolve('@deepseek-ai/dsh-app-boot');
    const appBoot = (await import(
      /* @vite-ignore */ pathToFileURL(appBootPath).href
    )) as DshAppBoot;

    const prof = appBoot.loadProfile('dsh', profile, installAnchor, home);
    const patches = [...prof.layers.flatMap((l) => l.patches), ...prof.patches];

    rootDir = mkdtempSync(join(opts.stateDir ?? tmpdir(), 'ig-dsh-'));
    const rootConfig = join(rootDir, 'cordis.yml');
    writeFileSync(rootConfig, '[]\n');

    const t0 = Date.now();
    const ctx = await appBoot.boot(
      'dsh',
      rootConfig,
      patches,
      () => {},
      pathToFileURL(installAnchor).href,
    );
    logger.info(
      `dsh core booted (profile=${profile}, layers=${prof.layers
        .map((l) => l.packageName)
        .join(',')}, patches=${patches.length}, ${Date.now() - t0}ms)`,
    );
    return ctx;
  }

  async function disposeCore(): Promise<void> {
    const c = core;
    core = undefined;
    try {
      await c?.fiber?.dispose();
    } finally {
      if (rootDir) rmSync(rootDir, { recursive: true, force: true });
      rootDir = undefined;
    }
  }

  return {
    async boot(profile: string, startOpts: StartOptions): Promise<PluginContext> {
      const mode = resolveCoreMode(opts.core);
      if (mode !== 'off') {
        try {
          core = await bootCore(profile, startOpts.home);
        } catch (err) {
          await disposeCore().catch(() => {});
          if (mode === 'required') throw err;
          logger.warn(
            `dsh core not started (IG_DSH_CORE=auto); continuing with ig plugin host only: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      host = createIgPluginHost({ logger, extras: { dsh: core } });
      try {
        await host.apply(pluginsFor(profile));
        // 预热持久化的用户画像（ProfileStore.get() 是同步的，只读内存）
        await host.ctx.inject(UserProfileKey)?.export();
      } catch (err) {
        await host.dispose().catch(() => {});
        host = undefined;
        await disposeCore().catch(() => {});
        throw err;
      }
      logger.info(`ig plugins applied: ${host.applied.join(', ')}`);
      return host.ctx;
    },
    async dispose() {
      const h = host;
      host = undefined;
      await h?.dispose();
      await disposeCore();
    },
  };
}
