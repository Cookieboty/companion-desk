/**
 * 对话后端：Nomi | Claude Code | Codex。
 * CLI 模式下禁用 Nomi 工具（由渲染层 + 此服务共同保证：send 不走 AIClient）。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BrowserWindow, dialog, ipcMain } from 'electron';

import { t } from '../i18n';

import { resolveCliBin } from './detect';
import { parseClaudeLine, parseCodexLine } from './streamParse';
import type { HarnessBackend, HarnessEvent, HarnessSendResult, HarnessSessionState } from './types';

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

function mockDir(): string {
  // packages/electron/scripts/mock-cli（开发）或随包 resources
  const candidates = [
    path.resolve(__dirname, '../../scripts/mock-cli'),
    path.resolve(__dirname, '../scripts/mock-cli'),
    path.resolve(process.cwd(), 'packages/electron/scripts/mock-cli'),
    path.resolve(process.cwd(), 'scripts/mock-cli'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'mock-claude.mjs'))) return c;
  }
  return candidates[0]!;
}

export function resolveHarnessBin(backend: 'claude' | 'codex'): string | null {
  if (process.env.NOMI_USE_MOCK_CLI === '1') {
    const d = mockDir();
    return path.join(d, backend === 'claude' ? 'mock-claude.mjs' : 'mock-codex.mjs');
  }
  return resolveCliBin(backend);
}

export class CliHarnessService {
  private backend: HarnessBackend = 'nomi';
  private cwd: string;
  private cliSessionId: string | null = null;
  private busy = false;
  private readonly home: string;
  private readonly statePath: string;

  constructor(
    private readonly d: { root: string; logger: Logger; home?: string; defaultCwd?: string },
  ) {
    this.home = d.home ?? os.homedir();
    this.cwd = d.defaultCwd ?? process.cwd();
    this.statePath = path.join(d.root, 'session.json');
    fs.mkdirSync(d.root, { recursive: true });
    this.load();
  }

  private load() {
    try {
      const raw = JSON.parse(
        fs.readFileSync(this.statePath, 'utf8'),
      ) as Partial<HarnessSessionState>;
      if (raw.backend === 'claude' || raw.backend === 'codex' || raw.backend === 'nomi') {
        this.backend = raw.backend;
      }
      if (typeof raw.cwd === 'string' && raw.cwd) this.cwd = raw.cwd;
      if (typeof raw.cliSessionId === 'string') this.cliSessionId = raw.cliSessionId;
    } catch {
      /* */
    }
  }

  private persist() {
    const s: HarnessSessionState = {
      backend: this.backend,
      cwd: this.cwd,
      cliSessionId: this.cliSessionId,
      busy: this.busy,
    };
    fs.writeFileSync(this.statePath, JSON.stringify(s, null, 2), 'utf8');
  }

  state(): HarnessSessionState & { toolsDisabled: boolean; bins: Record<string, string | null> } {
    return {
      backend: this.backend,
      cwd: this.cwd,
      cliSessionId: this.cliSessionId,
      busy: this.busy,
      toolsDisabled: this.backend !== 'nomi',
      bins: {
        claude: resolveHarnessBin('claude'),
        codex: resolveHarnessBin('codex'),
      },
    };
  }

  setBackend(
    backend: HarnessBackend,
  ): HarnessSessionState & { toolsDisabled: boolean; bins: Record<string, string | null> } {
    if (backend !== 'nomi' && backend !== 'claude' && backend !== 'codex') {
      throw new Error(t('未知后端'));
    }
    this.backend = backend;
    if (backend === 'nomi') this.cliSessionId = null;
    this.persist();
    this.broadcast();
    return this.state();
  }

  setCwd(cwd: string): ReturnType<CliHarnessService['state']> {
    const abs = path.resolve(cwd);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(t('工作目录无效'));
    }
    this.cwd = abs;
    this.persist();
    this.broadcast();
    return this.state();
  }

  async pickCwd(): Promise<ReturnType<CliHarnessService['state']>> {
    const r = await dialog.showOpenDialog({
      title: t('选择编程助手工作目录'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: this.cwd,
    });
    if (r.canceled || !r.filePaths[0]) return this.state();
    return this.setCwd(r.filePaths[0]);
  }

  /** 发送一轮；Nomi 后端由渲染层走 AIClient，不应调用此方法 */
  async send(prompt: string): Promise<HarnessSendResult> {
    if (this.backend === 'nomi') {
      throw new Error(t('当前为 Nomi 后端，请走原生对话'));
    }
    if (this.busy) throw new Error(t('上一轮尚未结束'));
    const text = String(prompt ?? '').slice(0, 100_000);
    if (!text.trim()) throw new Error(t('消息为空'));
    this.busy = true;
    this.broadcast();
    try {
      const result =
        this.backend === 'claude' ? await this.runClaude(text) : await this.runCodex(text);
      if (result.sessionId) this.cliSessionId = result.sessionId;
      this.persist();
      return result;
    } finally {
      this.busy = false;
      this.broadcast();
    }
  }

  private runClaude(prompt: string): Promise<HarnessSendResult> {
    const bin = resolveHarnessBin('claude');
    if (!bin) return Promise.reject(new Error(t('未找到 Claude Code（可设 NOMI_USE_MOCK_CLI=1）')));
    const useNode = bin.endsWith('.mjs') || bin.endsWith('.js');
    const argv = useNode
      ? [bin, '-p', prompt, '--output-format', 'stream-json', '--verbose']
      : [
          '-p',
          prompt,
          '--output-format',
          'stream-json',
          '--verbose',
          '--permission-prompts',
          'none',
        ];
    if (this.cliSessionId && !useNode) {
      argv.push('--resume', this.cliSessionId);
    }
    return this.spawnCollect({
      cmd: useNode ? process.execPath : bin,
      argv: useNode ? argv : argv,
      cwd: this.cwd,
      parseLine: parseClaudeLine,
      kind: 'claude',
    });
  }

  private runCodex(prompt: string): Promise<HarnessSendResult> {
    const bin = resolveHarnessBin('codex');
    if (!bin) return Promise.reject(new Error(t('未找到 Codex（可设 NOMI_USE_MOCK_CLI=1）')));
    const useNode = bin.endsWith('.mjs') || bin.endsWith('.js');
    const argv = useNode
      ? [bin, 'exec', '--json', prompt]
      : ['exec', '--json', '--skip-git-repo-check', '--cd', this.cwd, prompt];
    // resume if we have session
    if (this.cliSessionId && !useNode) {
      argv.splice(1, 0, 'resume', this.cliSessionId);
      // becomes: exec resume <id> --json ...
    }
    return this.spawnCollect({
      cmd: useNode ? process.execPath : bin,
      argv: useNode ? argv : argv,
      cwd: this.cwd,
      parseLine: parseCodexLine,
      kind: 'codex',
    });
  }

  private spawnCollect(opts: {
    cmd: string;
    argv: string[];
    cwd: string;
    parseLine: (line: string) => HarnessEvent[];
    kind: 'claude' | 'codex';
  }): Promise<HarnessSendResult> {
    return new Promise((resolve, reject) => {
      const events: HarnessEvent[] = [];
      let text = '';
      let sessionId: string | null = this.cliSessionId;
      let buf = '';
      const child: ChildProcessWithoutNullStreams = spawn(opts.cmd, opts.argv, {
        cwd: opts.cwd,
        env: {
          ...process.env,
          NO_COLOR: '1',
          // 不向 CLI 泄漏无关的 NOMI_* token；保留 PATH / HOME / 用户已有 ANTHROPIC_/OPENAI_
        },
        windowsHide: true,
      });

      // 真实 CLI 在 stdin 为管道时会等待 EOF 读取附加输入（codex exec 会一直挂起）
      child.stdin.end();

      const onChunk = (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const parts = buf.split(/\r?\n/);
        buf = parts.pop() ?? '';
        for (const line of parts) {
          for (const ev of opts.parseLine(line)) {
            events.push(ev);
            this.emitEvent(ev);
            if (ev.type === 'text-delta' || ev.type === 'text') text += ev.text;
            if (ev.type === 'done') {
              if (ev.text) text = ev.text || text;
              if (ev.sessionId) sessionId = ev.sessionId;
            }
          }
        }
      };
      child.stdout.on('data', onChunk);
      child.stderr.on('data', (c) => {
        this.d.logger.warn(`harness ${opts.kind} stderr`, String(c).slice(0, 500));
      });
      child.on('error', (e) => reject(e));
      child.on('close', (code) => {
        if (buf.trim()) {
          for (const ev of opts.parseLine(buf)) {
            events.push(ev);
            if (ev.type === 'text-delta' || ev.type === 'text') text += ev.text;
            if (ev.type === 'done' && ev.sessionId) sessionId = ev.sessionId;
          }
        }
        if (code && code !== 0 && !text) {
          reject(new Error(t('{0} 退出码 {1}', opts.kind, code)));
          return;
        }
        resolve({ text: text || t('（无文本输出）'), sessionId, events });
      });
    });
  }

  private emitEvent(ev: HarnessEvent) {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('ai:harness:event', ev);
      } catch {
        /* */
      }
    }
  }

  private broadcast() {
    const s = this.state();
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('ai:harness:changed', s);
      } catch {
        /* */
      }
    }
  }

  registerIpc(): void {
    const handle = (ch: string, fn: (...a: unknown[]) => unknown) => {
      ipcMain.removeHandler(ch);
      ipcMain.handle(ch, async (_e, ...a) => {
        try {
          return await fn(...a);
        } catch (err) {
          return { __error: { message: err instanceof Error ? err.message : String(err) } };
        }
      });
    };
    handle('ai:harness:state', () => this.state());
    handle('ai:harness:set-backend', (b) => this.setBackend(b as HarnessBackend));
    handle('ai:harness:set-cwd', (c) => this.setCwd(String(c)));
    handle('ai:harness:pick-cwd', () => this.pickCwd());
    handle('ai:harness:send', (p) => this.send(String(p ?? '')));
  }
}

let inst: CliHarnessService | null = null;
export function initCliHarnessService(d: {
  root: string;
  logger: Logger;
  home?: string;
  defaultCwd?: string;
}): CliHarnessService {
  inst = new CliHarnessService(d);
  return inst;
}
export function getCliHarnessService(): CliHarnessService | null {
  return inst;
}
