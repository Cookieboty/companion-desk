/**
 * P9-5 · runDoctor 单测
 *
 * 通过 loader 注入避免真的加载 dsh；用 fake profile 覆盖 ok / warn / fail 三种终态。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkNodeVersion, runDoctor, summarizeStatus } from '../lib/doctor/index';

const FAKE_ROOT = '/tmp/doctor-fake-root';
const FAKE_ANCHOR = '/tmp/doctor-fake-anchor/package.json';

function fakeProfile(overrides: Partial<{ layerEntries: number; userPatches: number }> = {}) {
  return {
    name: 'waifu',
    dir: '/tmp/waifu',
    patchReload: false as const,
    patchPath: '/tmp/waifu/cordis.patch.yml',
    patches: new Array(overrides.userPatches ?? 1).fill(undefined).map((_, i) => ({ id: `u${i}` })),
    layers: [
      {
        packageName: '@deepseek-ai/dsh-base',
        packageDir: '/tmp/base',
        patchPath: '/tmp/base/patch.yml',
        patches: new Array(overrides.layerEntries ?? 60)
          .fill(undefined)
          .map((_, i) => ({ id: `b${i}` })),
      },
    ],
  } as unknown as import('@deepseek-ai/dsh-app-boot').Profile;
}

const makeLoader = (behavior: { entries?: number; warnings?: string[]; throwErr?: Error }) =>
  ({
    loadProfile: () => {
      if (behavior.throwErr) throw behavior.throwErr;
      return fakeProfile();
    },
    composeEntries: (_layers: unknown[], onWarn: (m: string) => void) => {
      for (const w of behavior.warnings ?? []) onWarn(w);
      return new Array(behavior.entries ?? 60).fill(undefined).map((_, i) => ({ id: `e${i}` }));
    },
  }) as unknown as Parameters<typeof runDoctor>[0]['loader'];

describe('runDoctor', () => {
  it('status=ok · 节点检查 + profile 装配全绿', () => {
    const report = runDoctor({
      projectRoot: FAKE_ROOT,
      profileName: 'waifu',
      installAnchor: FAKE_ANCHOR,
      nodeVersion: '20.15.0',
      platform: 'darwin',
      arch: 'arm64',
      engineRequirement: '>=20.11',
      loader: makeLoader({ entries: 60 }),
      now: () => '2026-03-18T15:00:00.000Z',
    });

    expect(report.status).toBe('ok');
    expect(report.node.meetsEngineRequirement).toBe(true);
    expect(report.profile?.entries).toBe(60);
    expect(report.profile?.warnings).toEqual([]);
    const ids = report.checks.map((c) => c.id);
    expect(ids).toContain('node.version');
    expect(ids).toContain('node.platform');
    expect(ids).toContain('profile.load');
    expect(ids).toContain('profile.compose');
    expect(report.checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('status=warn · composeEntries 产生 skipped-patch 警告', () => {
    const report = runDoctor({
      projectRoot: FAKE_ROOT,
      profileName: 'chat-only',
      installAnchor: FAKE_ANCHOR,
      nodeVersion: '20.15.0',
      engineRequirement: '>=20.11',
      loader: makeLoader({
        entries: 55,
        warnings: ['skip patch#12: id "foo" not found'],
      }),
    });

    expect(report.status).toBe('warn');
    const composeCheck = report.checks.find((c) => c.id === 'profile.compose');
    expect(composeCheck?.status).toBe('warn');
    const warningCheck = report.checks.find((c) => c.id === 'profile.compose.warning');
    expect(warningCheck?.message).toContain('skip patch#12');
  });

  it('status=fail · Node 版本不满足 engines.node', () => {
    const report = runDoctor({
      projectRoot: FAKE_ROOT,
      profileName: 'waifu',
      installAnchor: FAKE_ANCHOR,
      nodeVersion: '18.19.0',
      engineRequirement: '>=20.11',
      loader: makeLoader({ entries: 60 }),
    });

    expect(report.status).toBe('fail');
    const nodeCheck = report.checks.find((c) => c.id === 'node.version');
    expect(nodeCheck?.status).toBe('fail');
    expect(report.node.meetsEngineRequirement).toBe(false);
  });

  it('status=fail · loadProfile 抛错时保留装配错误信息', () => {
    const report = runDoctor({
      projectRoot: FAKE_ROOT,
      profileName: 'bad',
      installAnchor: FAKE_ANCHOR,
      nodeVersion: '20.15.0',
      engineRequirement: '>=20.11',
      loader: makeLoader({ throwErr: new Error('profile "bad" does not exist') }),
    });

    expect(report.status).toBe('fail');
    expect(report.profile).toBeUndefined();
    const loadCheck = report.checks.find((c) => c.id === 'profile.load');
    expect(loadCheck?.status).toBe('fail');
    expect(loadCheck?.message).toContain('profile "bad" does not exist');
  });

  it('status=fail · composed entry list 为空', () => {
    const report = runDoctor({
      projectRoot: FAKE_ROOT,
      profileName: 'waifu',
      installAnchor: FAKE_ANCHOR,
      nodeVersion: '20.15.0',
      engineRequirement: '>=20.11',
      loader: makeLoader({ entries: 0 }),
    });

    expect(report.status).toBe('fail');
    const composeCheck = report.checks.find((c) => c.id === 'profile.compose');
    expect(composeCheck?.status).toBe('fail');
    expect(composeCheck?.message).toContain('为空');
  });

  it('未声明 engines.node 时跳过版本检查并保持 ok', () => {
    const report = runDoctor({
      projectRoot: FAKE_ROOT,
      profileName: 'waifu',
      installAnchor: FAKE_ANCHOR,
      nodeVersion: '18.0.0',
      engineRequirement: undefined,
      loader: makeLoader({ entries: 60 }),
    });

    expect(report.status).toBe('ok');
    expect(report.node.meetsEngineRequirement).toBe(true);
  });
});

describe('runDoctor · JSON 报告可 structuredClone-safe', () => {
  it('report 可 JSON.stringify 并写盘', () => {
    const report = runDoctor({
      projectRoot: FAKE_ROOT,
      profileName: 'waifu',
      installAnchor: FAKE_ANCHOR,
      nodeVersion: '20.15.0',
      engineRequirement: '>=20.11',
      loader: makeLoader({ entries: 60 }),
      now: () => '2026-03-18T15:00:00.000Z',
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-report-'));
    const file = path.join(tmp, 'report.json');
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    const roundTrip = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof report;
    expect(roundTrip.status).toBe('ok');
    expect(roundTrip.node.version).toBe('20.15.0');
    expect(roundTrip.profile?.entries).toBe(60);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('summarizeStatus', () => {
  it('任一 fail → fail', () => {
    expect(
      summarizeStatus([
        { id: 'a', label: 'a', status: 'ok', message: '' },
        { id: 'b', label: 'b', status: 'fail', message: '' },
        { id: 'c', label: 'c', status: 'warn', message: '' },
      ]),
    ).toBe('fail');
  });
  it('无 fail 但存在 warn → warn', () => {
    expect(
      summarizeStatus([
        { id: 'a', label: 'a', status: 'ok', message: '' },
        { id: 'b', label: 'b', status: 'warn', message: '' },
      ]),
    ).toBe('warn');
  });
  it('全 ok → ok', () => {
    expect(summarizeStatus([{ id: 'a', label: 'a', status: 'ok', message: '' }])).toBe('ok');
  });
});

describe('checkNodeVersion', () => {
  it('满足 >= 需求', () => {
    expect(checkNodeVersion('20.15.0', '>=20.11').meets).toBe(true);
    expect(checkNodeVersion('22.0.0', '>=20.11').meets).toBe(true);
  });
  it('不满足 >= 需求', () => {
    expect(checkNodeVersion('20.10.0', '>=20.11').meets).toBe(false);
    expect(checkNodeVersion('18.20.0', '>=20.11').meets).toBe(false);
  });
  it('未声明 requirement → 视为通过', () => {
    expect(checkNodeVersion('18.0.0', undefined).meets).toBe(true);
  });
  it('非标准 requirement → 视为通过并说明', () => {
    const r = checkNodeVersion('18.0.0', '^20.0.0');
    expect(r.meets).toBe(true);
    expect(r.note).toContain('仅记录');
  });
});
