/**
 * CLI 安装 / 更新：计划（确切命令 + 前置检查）、白名单、Mock npm 执行、错误透出。
 * 用注入的 probe / runner 代替真实 npm；会真正生成 / 读取 Mock CLI 的只在 POSIX 上跑。
 */
jest.unmock('fs');
jest.unmock('path');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CliUpdateService,
  isAllowedUpdateArgv,
  userPrefix,
  type CliProbe,
  type CliRunner,
} from '../../../src/cli/CliUpdateService';

const posix = process.platform === 'win32' ? it.skip : it;

let tmp = '';
const saved = { ...process.env };
let events: Array<Record<string, unknown>> = [];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-install-'));
  // jest 的 process.env 是副本，改 HOME 不会影响 os.homedir()，所以直接 spy
  jest.spyOn(os, 'homedir').mockReturnValue(tmp);
  // 让 `which` 找不到任何真实的 claude / codex / dsh
  process.env.PATH = path.join(tmp, 'empty');
  delete process.env.NOMI_CLAUDE_BIN;
  delete process.env.NOMI_CODEX_BIN;
  delete process.env.NOMI_DSH_BIN;
  delete process.env.NOMI_NPM_BIN;
  events = [];
});
afterEach(() => {
  jest.restoreAllMocks();
  // 不能整体替换 process.env（会脱离真实环境变量，os.homedir() 不再跟随）
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  for (const [k, v] of Object.entries(saved)) process.env[k] = v;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const probe = (over: Partial<CliProbe> = {}): CliProbe => ({
  nodeVersion: () => '24.1.0',
  npmBin: () => '/usr/bin/npm',
  npmPrefix: () => '/usr/local',
  canWrite: () => true,
  ...over,
});

const make = (p: CliProbe, runner: CliRunner = async () => ({ code: 0, output: '' })) =>
  new CliUpdateService({
    root: path.join(tmp, 'cache'),
    logger: { info: jest.fn(), warn: jest.fn() },
    probe: p,
    runner,
    silent: true,
    emit: (e) => events.push(e as Record<string, unknown>),
  });

describe('install plan', () => {
  it('not-installed dsh: exact npm command, all requirements green', async () => {
    const plan = await make(probe()).previewUpdate('dsh');
    expect(plan.mode).toBe('install');
    expect(plan.command).toMatch(/^npm(\.cmd)? install -g @deepseek-ai\/dsh@latest$/);
    expect(plan.blockers).toEqual([]);
    expect(plan.requirements.map((r) => [r.id, r.ok])).toEqual([
      ['node', true],
      ['npm', true],
      ['write', true],
    ]);
  });

  it('dsh needs Node >= 24: blocks with the detected version', async () => {
    const plan = await make(probe({ nodeVersion: () => '22.14.0' })).previewUpdate('dsh');
    expect(plan.blockers.join()).toContain('24');
    expect(plan.blockers.join()).toContain('22.14.0');
    expect(plan.requirements.find((r) => r.id === 'node')?.ok).toBe(false);
    // 同一个 Node 装 Claude Code（≥22）没问题
    expect(
      (await make(probe({ nodeVersion: () => '22.14.0' })).previewUpdate('claude')).blockers,
    ).toEqual([]);
  });

  it('missing node / npm are reported, never silently ignored', async () => {
    const plan = await make(probe({ nodeVersion: () => null, npmBin: () => null })).previewUpdate(
      'codex',
    );
    expect(plan.blockers).toHaveLength(2);
    expect(plan.requirements.find((r) => r.id === 'npm')?.ok).toBe(false);
  });

  it('read-only global prefix: no sudo, offers the user-directory command instead', async () => {
    const svc = make(probe({ canWrite: (d) => d !== '/usr/local' }));
    const plan = await svc.previewUpdate('claude');
    expect(plan.blockers.join()).toMatch(/sudo/);
    expect(plan.userScopeCommand).toContain(`--prefix`);
    expect(plan.userScopeCommand).toContain('.local');
    expect(plan.command).not.toMatch(/sudo/);
    const user = await svc.previewUpdate('claude', 'user');
    expect(user.blockers).toEqual([]);
    expect(user.argv.slice(-2)).toEqual(['--prefix', userPrefix()]);
    expect(isAllowedUpdateArgv(user.argv)).toBe(true);
  });

  it('whitelist: only the three packages, only the user prefix', () => {
    const base = ['npm', 'install', '-g'];
    expect(isAllowedUpdateArgv([...base, '@deepseek-ai/dsh@latest'])).toBe(true);
    expect(isAllowedUpdateArgv([...base, '@deepseek-ai/dsh@latest', '--prefix', '/etc'])).toBe(
      false,
    );
    expect(isAllowedUpdateArgv([...base, 'left-pad@latest'])).toBe(false);
    expect(isAllowedUpdateArgv(['sudo', ...base, '@openai/codex@latest'])).toBe(false);
    expect(isAllowedUpdateArgv([...base, '@openai/codex@latest', '--unsafe-perm'])).toBe(false);
  });
});

describe('run with a mock npm', () => {
  const installMock =
    (name: string, version: string): CliRunner =>
    async (argv, onLine) => {
      onLine(`added 1 package`);
      const prefix = argv.includes('--prefix') ? argv[argv.indexOf('--prefix') + 1]! : tmp;
      const bin = path.join(prefix, 'bin');
      fs.mkdirSync(bin, { recursive: true });
      const f = path.join(bin, name);
      fs.writeFileSync(f, `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
      return { code: 0, output: 'added 1 package' };
    };

  posix(
    'installs dsh into the user directory, streams log lines, finds the new binary',
    async () => {
      const svc = make(probe({ canWrite: () => true }), installMock('dsh', '0.2.0-rc.2'));
      const res = await svc.run('dsh', 'user');
      expect(res.ok).toBe(true);
      expect(res.version).toBe('0.2.0-rc.2');
      expect(res.path).toBe(path.join(tmp, '.local', 'bin', 'dsh'));
      const phases = events.map((e) => e.phase);
      expect(phases[0]).toBe('start');
      expect(phases).toContain('log');
      expect(phases[phases.length - 1]).toBe('done');
      expect(events.find((e) => e.phase === 'start')).toMatchObject({
        kind: 'dsh',
        mode: 'install',
      });
      // PATH 上没有 ~/.local/bin → 给出提示
      expect(res.note).toContain('PATH');
      // 装完再看就是「更新」模式
      expect((await svc.previewUpdate('dsh')).mode).toBe('update');
    },
  );

  it('surfaces the npm error text and exit code when the command fails', async () => {
    const svc = make(probe(), async (_a, onLine) => {
      onLine('npm ERR! code EACCES');
      return { code: 243, output: 'npm ERR! code EACCES\nnpm ERR! permission denied' };
    });
    const res = await svc.run('codex');
    expect(res.ok).toBe(false);
    expect(res.log).toContain('EACCES');
    expect(res.log).toContain('243');
    expect(events[events.length - 1]).toMatchObject({ phase: 'error' });
  });

  it('refuses to run when a requirement is not met (runner never called)', async () => {
    const runner = jest.fn(async () => ({ code: 0, output: '' }));
    const svc = make(probe({ nodeVersion: () => '20.0.0' }), runner);
    const res = await svc.run('dsh');
    expect(res.ok).toBe(false);
    expect(res.log).toContain('24');
    expect(runner).not.toHaveBeenCalled();
  });

  it('only one install / update at a time', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const svc = make(probe(), async () => {
      await gate;
      return { code: 1, output: 'x' };
    });
    const first = svc.run('claude');
    const second = await svc.run('codex');
    expect(second.ok).toBe(false);
    release();
    await first;
  });

  posix('updating an installed claude falls back from `claude update` to npm', async () => {
    const bin = path.join(tmp, '.local', 'share', 'claude', 'claude');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, '#!/bin/sh\necho 1.0.0\n', { mode: 0o755 });
    process.env.NOMI_CLAUDE_BIN = bin;
    const calls: string[][] = [];
    const svc = make(probe(), async (argv) => {
      calls.push(argv);
      return argv[1] === 'update'
        ? { code: 1, output: 'not supported' }
        : { code: 0, output: 'ok' };
    });
    expect((await svc.previewUpdate('claude')).mode).toBe('update');
    const res = await svc.run('claude');
    expect(calls.map((c) => c.slice(1).join(' '))).toEqual([
      'update',
      'install -g @anthropic-ai/claude-code@latest',
    ]);
    expect(res.ok).toBe(true);
  });
});
