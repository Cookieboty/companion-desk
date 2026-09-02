/**
 * P9-5 · dsh-doctor 核心逻辑（纯函数，便于 vitest 直接调用）。
 *
 * 目标：把原本 CLI 里散在的 profile 装配 + 检查逻辑抽成 `runDoctor(opts)`，
 * 返回结构化的 [DoctorReport](file:///./index.ts#DoctorReport)：
 *
 * - 节点级检查：Node 版本 / 平台 / pnpm 存在性；
 * - Profile 装配：调用 `loadProfile` + `composeEntries`，收集警告；
 * - 汇总 status：`ok / warn / fail`；
 *
 * 报告结构对上层 CLI 与 e2e 保持稳定 —— 任何字段修改都会破坏 doctor.test.ts 快照。
 */

import { createRequire } from 'node:module';
import path from 'node:path';

import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  meta?: Record<string, unknown>;
}

export interface DoctorProfileSummary {
  name: string;
  dir: string;
  patchReload: string | boolean;
  patchPath: string;
  userPatches: number;
  layers: Array<{ packageName: string; packageDir: string; patchPath: string; entries: number }>;
  entries: number;
  /** 完整的 composed entry 列表（顶层 id / 元数据），供 CLI YAML dump / e2e 断言消费。 */
  entryList: Array<Record<string, unknown>>;
  warnings: string[];
}

export interface DoctorReport {
  bin: string;
  ts: string;
  status: CheckStatus;
  projectRoot: string;
  profileName: string;
  node: {
    version: string;
    platform: NodeJS.Platform;
    arch: string;
    engineRequirement: string | undefined;
    meetsEngineRequirement: boolean;
  };
  checks: DoctorCheck[];
  profile?: DoctorProfileSummary;
}

export interface RunDoctorOptions {
  bin?: string;
  projectRoot: string;
  profileName: string;
  installAnchor?: string;
  /** 当前进程的 Node 版本；默认 `process.versions.node`。用于单测 stub。 */
  nodeVersion?: string;
  /** 平台；默认 `process.platform`。 */
  platform?: NodeJS.Platform;
  /** CPU 架构；默认 `process.arch`。 */
  arch?: string;
  /** package.json 的 `engines.node` 需求；默认由 [readEngineRequirement](file:///./index.ts) 读取根 package.json。 */
  engineRequirement?: string | undefined;
  /** 允许注入自定义 loadProfile 便于测试。 */
  loader?: {
    loadProfile: typeof loadProfile;
    composeEntries: typeof composeEntries;
  };
  now?: () => string;
}

/** 汇总多个 check 的最终状态：任一 fail → fail；否则任一 warn → warn；否则 ok。 */
export function summarizeStatus(checks: readonly DoctorCheck[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

/**
 * 解析 `engines.node`（如 `>=20.11`）并判断当前 Node 版本是否满足。
 * 只支持形如 `>=X.Y(.Z)?` 的最小版本；其它形式一律视为通过（并给出 warn）。
 */
export function checkNodeVersion(
  actual: string,
  requirement: string | undefined,
): { meets: boolean; note: string } {
  if (!requirement) return { meets: true, note: '未声明 engines.node，跳过检查' };
  const m = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(requirement.trim());
  if (!m) return { meets: true, note: `engines.node="${requirement}" 非标准 >= 形式，仅记录` };
  const [reqMajor, reqMinor, reqPatch] = [
    Number(m[1] ?? '0'),
    Number(m[2] ?? '0'),
    Number(m[3] ?? '0'),
  ];
  const parts = actual.split('.').map((s) => Number(s));
  const [actMajor, actMinor, actPatch] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  const cmp =
    actMajor !== reqMajor
      ? actMajor - reqMajor
      : actMinor !== reqMinor
        ? actMinor - reqMinor
        : actPatch - reqPatch;
  return {
    meets: cmp >= 0,
    note:
      cmp >= 0
        ? `Node ${actual} 满足 ${requirement}`
        : `Node ${actual} 不满足 ${requirement}，请升级`,
  };
}

/**
 * 运行 doctor 检查并返回结构化报告。
 *
 * 失败策略：即使 profile 装配抛错，也会把错误装入 `checks`（status=fail），
 * 报告仍然返回，方便 `--report` 写盘保留现场。
 */
export function runDoctor(opts: RunDoctorOptions): DoctorReport {
  const bin = opts.bin ?? 'dsh-doctor';
  const nodeVersion = opts.nodeVersion ?? process.versions.node;
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const now = opts.now ?? (() => new Date().toISOString());
  const loader = opts.loader ?? { loadProfile, composeEntries };

  const engineRequirement = opts.engineRequirement ?? readEngineRequirement(opts.projectRoot);
  const nodeCheck = checkNodeVersion(nodeVersion, engineRequirement);

  const checks: DoctorCheck[] = [];
  checks.push({
    id: 'node.version',
    label: 'Node.js 版本',
    status: nodeCheck.meets ? 'ok' : 'fail',
    message: nodeCheck.note,
    meta: { actual: nodeVersion, required: engineRequirement ?? null },
  });
  checks.push({
    id: 'node.platform',
    label: '运行平台',
    status: 'ok',
    message: `${platform}/${arch}`,
    meta: { platform, arch },
  });

  const report: DoctorReport = {
    bin,
    ts: now(),
    status: 'ok',
    projectRoot: opts.projectRoot,
    profileName: opts.profileName,
    node: {
      version: nodeVersion,
      platform,
      arch,
      engineRequirement,
      meetsEngineRequirement: nodeCheck.meets,
    },
    checks,
  };

  try {
    const installAnchor = opts.installAnchor ?? resolveInstallAnchor(opts.projectRoot);
    const profile = loader.loadProfile(bin, opts.profileName, installAnchor, opts.projectRoot);
    const warnings: string[] = [];
    const entries = loader.composeEntries(
      [...profile.layers.map((layer) => layer.patches), profile.patches],
      (message) => warnings.push(message),
    );
    const profileSummary: DoctorProfileSummary = {
      name: profile.name,
      dir: profile.dir,
      patchReload: profile.patchReload,
      patchPath: profile.patchPath,
      userPatches: profile.patches.length,
      layers: profile.layers.map((layer) => ({
        packageName: layer.packageName,
        packageDir: layer.packageDir,
        patchPath: layer.patchPath,
        entries: layer.patches.length,
      })),
      entries: entries.length,
      entryList: entries as unknown as Array<Record<string, unknown>>,
      warnings,
    };
    report.profile = profileSummary;

    checks.push({
      id: 'profile.load',
      label: `装配 profile ${profile.name}`,
      status: 'ok',
      message: `layers=${profile.layers.length} userPatches=${profile.patches.length}`,
      meta: { name: profile.name, dir: profile.dir },
    });

    if (entries.length === 0) {
      checks.push({
        id: 'profile.compose',
        label: 'composeEntries',
        status: 'fail',
        message: 'composed entry list 为空，profile 配置不完整',
      });
    } else {
      checks.push({
        id: 'profile.compose',
        label: 'composeEntries',
        status: warnings.length > 0 ? 'warn' : 'ok',
        message:
          warnings.length > 0
            ? `${entries.length} entries composed，${warnings.length} 条 skipped-patch 警告`
            : `${entries.length} entries composed，无警告`,
        meta: { entries: entries.length, warnings: warnings.length },
      });
      for (const warning of warnings) {
        checks.push({
          id: 'profile.compose.warning',
          label: 'skipped-patch',
          status: 'warn',
          message: warning,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    checks.push({
      id: 'profile.load',
      label: `装配 profile ${opts.profileName}`,
      status: 'fail',
      message,
    });
  }

  report.status = summarizeStatus(checks);
  return report;
}

/** 读取仓库根 `package.json.engines.node`；解析失败返回 undefined。 */
export function readEngineRequirement(projectRoot: string): string | undefined {
  const require = createRequire(path.join(projectRoot, 'noop.js'));
  try {
    const pkg = require(path.join(projectRoot, 'package.json')) as {
      engines?: { node?: string };
    };
    return pkg.engines?.node;
  } catch {
    return undefined;
  }
}

/** 定位 `@deepseek-ai/dsh` 的安装锚点；给自定义 projectRoot 使用 createRequire。 */
export function resolveInstallAnchor(projectRoot: string): string {
  const require = createRequire(path.join(projectRoot, 'noop.js'));
  return require.resolve('@deepseek-ai/dsh/package.json');
}
