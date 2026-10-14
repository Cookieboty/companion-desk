/**
 * 对话后端：Nomi | Claude Code | Codex | dsh，按「标签」并发运行。
 *
 * - 标签 'main'：原有对话，后端可为 Nomi 或任一 CLI；消息由渲染层存进 Nomi 历史。
 *   旧的单会话接口（state / setBackend / setCwd / send）都作用于它。
 * - 其它标签：只绑定 CLI 后端，带独立的 CLI 会话与 cwd，消息存于 harness/tabs/<id>.json。
 * - 全局并发上限（默认 3）：超出的轮次排队（status = queued）。
 * - CLI 模式下禁用 Nomi 工具（send 不走 AIClient）。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BrowserWindow, dialog, ipcMain } from 'electron';

import { t } from '../i18n';

import { DSH_MIN_NODE_MAJOR, readPathNodeVersion, resolveCliBin } from './detect';
import { createDshParser, parseClaudeLine, parseCodexLine } from './streamParse';
import type {
  HarnessBackend,
  HarnessEvent,
  HarnessSendResult,
  HarnessSessionState,
  HarnessTabMessage,
  HarnessTabMeta,
  HarnessTabsState,
} from './types';

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

type CliBackend = Exclude<HarnessBackend, 'nomi'>;

export const MAIN_TAB_ID = 'main';
export const DEFAULT_MAX_CONCURRENT = 3;
const MAX_TAB_MESSAGES = 300;

const BACKENDS: readonly HarnessBackend[] = ['nomi', 'claude', 'codex', 'dsh'];

function isBackend(v: unknown): v is HarnessBackend {
  return typeof v === 'string' && (BACKENDS as readonly string[]).includes(v);
}

const BACKEND_TITLE: Record<HarnessBackend, string> = {
  nomi: 'Nomi',
  claude: 'Claude Code',
  codex: 'Codex',
  dsh: 'dsh',
};

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

export function resolveHarnessBin(backend: CliBackend): string | null {
  if (process.env.NOMI_USE_MOCK_CLI === '1') {
    return path.join(mockDir(), `mock-${backend}.mjs`);
  }
  return resolveCliBin(backend);
}

/** 标签结束一轮 / 出错时发给主进程订阅者（看板娘、灵动岛、监视器） */
export interface HarnessTabFinished {
  tabId: string;
  title: string;
  backend: HarnessBackend;
  ok: boolean;
  text: string;
  error?: string;
  /** 结束时该标签不在前台（需要提醒） */
  background: boolean;
}

type State = ReturnType<CliHarnessService['state']>;

export class CliHarnessService {
  private readonly tabs = new Map<string, HarnessTabMeta>();
  private readonly messages = new Map<string, HarnessTabMessage[]>();
  private readonly children = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly waiters: Array<() => void> = [];
  private running = 0;
  private activeTabId = MAIN_TAB_ID;
  private maxConcurrent = DEFAULT_MAX_CONCURRENT;
  private readonly home: string;
  private readonly statePath: string;
  private readonly tabsPath: string;
  private readonly tabsDir: string;
  readonly events = new EventEmitter();

  constructor(
    private readonly d: {
      root: string;
      logger: Logger;
      home?: string;
      defaultCwd?: string;
      /** 启动 dsh 时注入的额外环境变量（例如启用档案的 NOMI_DSH_API_KEY） */
      dshEnv?: () => Record<string, string>;
    },
  ) {
    this.home = d.home ?? os.homedir();
    this.statePath = path.join(d.root, 'session.json');
    this.tabsPath = path.join(d.root, 'tabs.json');
    this.tabsDir = path.join(d.root, 'tabs');
    fs.mkdirSync(this.tabsDir, { recursive: true });
    const now = Date.now();
    this.tabs.set(MAIN_TAB_ID, {
      id: MAIN_TAB_ID,
      title: t('对话'),
      backend: 'nomi',
      cwd: d.defaultCwd ?? process.cwd(),
      cliSessionId: null,
      status: 'idle',
      unread: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.load();
  }

  // ───────────────────────── 持久化 ─────────────────────────

  private get main(): HarnessTabMeta {
    return this.tabs.get(MAIN_TAB_ID)!;
  }

  private load() {
    try {
      const raw = JSON.parse(
        fs.readFileSync(this.statePath, 'utf8'),
      ) as Partial<HarnessSessionState> & { title?: string };
      const m = this.main;
      if (isBackend(raw.backend)) m.backend = raw.backend;
      if (typeof raw.cwd === 'string' && raw.cwd) m.cwd = raw.cwd;
      if (typeof raw.cliSessionId === 'string') m.cliSessionId = raw.cliSessionId;
      if (typeof raw.title === 'string' && raw.title.trim()) m.title = raw.title;
    } catch {
      /* */
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.tabsPath, 'utf8')) as {
        activeTabId?: string;
        maxConcurrent?: number;
        tabs?: HarnessTabMeta[];
      };
      if (typeof raw.maxConcurrent === 'number') this.maxConcurrent = clampLimit(raw.maxConcurrent);
      for (const tab of raw.tabs ?? []) {
        if (!tab || typeof tab.id !== 'string' || tab.id === MAIN_TAB_ID) continue;
        if (!isBackend(tab.backend) || tab.backend === 'nomi') continue;
        // 重启时中断的轮次回到空闲
        this.tabs.set(tab.id, {
          ...tab,
          status: tab.status === 'error' ? 'error' : 'idle',
          unread: Number(tab.unread) || 0,
        });
      }
      if (raw.activeTabId && this.tabs.has(raw.activeTabId)) this.activeTabId = raw.activeTabId;
    } catch {
      /* */
    }
  }

  private persist() {
    const m = this.main;
    const s: HarnessSessionState & { title: string } = {
      backend: m.backend,
      cwd: m.cwd,
      cliSessionId: m.cliSessionId,
      busy: m.status === 'running' || m.status === 'queued',
      title: m.title,
    };
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(s, null, 2), 'utf8');
      const tabs = [...this.tabs.values()].filter((x) => x.id !== MAIN_TAB_ID);
      fs.writeFileSync(
        this.tabsPath,
        JSON.stringify(
          { activeTabId: this.activeTabId, maxConcurrent: this.maxConcurrent, tabs },
          null,
          2,
        ),
        'utf8',
      );
    } catch (e) {
      this.d.logger.warn('harness persist failed', e);
    }
  }

  private messagesPath(id: string) {
    return path.join(this.tabsDir, `${id.replace(/[^\w-]/g, '_')}.json`);
  }

  tabMessages(id: string): HarnessTabMessage[] {
    this.requireTab(id);
    if (id === MAIN_TAB_ID) return [];
    let list = this.messages.get(id);
    if (!list) {
      try {
        list = JSON.parse(fs.readFileSync(this.messagesPath(id), 'utf8')) as HarnessTabMessage[];
        if (!Array.isArray(list)) list = [];
      } catch {
        list = [];
      }
      this.messages.set(id, list);
    }
    return list;
  }

  private appendMessage(id: string, msg: HarnessTabMessage) {
    const tab = this.tabs.get(id);
    if (tab) tab.updatedAt = msg.timestamp;
    if (id === MAIN_TAB_ID) return;
    const list = this.tabMessages(id);
    list.push(msg);
    if (list.length > MAX_TAB_MESSAGES) list.splice(0, list.length - MAX_TAB_MESSAGES);
    try {
      fs.writeFileSync(this.messagesPath(id), JSON.stringify(list), 'utf8');
    } catch (e) {
      this.d.logger.warn('harness tab messages write failed', e);
    }
    this.post('ai:harness:tab-message', { tabId: id, message: msg });
  }

  // ───────────────────────── 旧接口（main 标签） ─────────────────────────

  state(): HarnessSessionState & { toolsDisabled: boolean; bins: Record<string, string | null> } {
    const m = this.main;
    return {
      backend: m.backend,
      cwd: m.cwd,
      cliSessionId: m.cliSessionId,
      busy: m.status === 'running' || m.status === 'queued',
      toolsDisabled: m.backend !== 'nomi',
      bins: {
        claude: resolveHarnessBin('claude'),
        codex: resolveHarnessBin('codex'),
        dsh: resolveHarnessBin('dsh'),
      },
    };
  }

  setBackend(backend: HarnessBackend): State {
    this.setTabBackend(MAIN_TAB_ID, backend);
    return this.state();
  }

  setCwd(cwd: string): State {
    this.setTabCwd(MAIN_TAB_ID, cwd);
    return this.state();
  }

  async pickCwd(): Promise<State> {
    await this.pickTabCwd(MAIN_TAB_ID);
    return this.state();
  }

  /** 发送一轮到 main 标签；Nomi 后端由渲染层走 AIClient，不应调用此方法 */
  send(prompt: string): Promise<HarnessSendResult> {
    return this.sendTab(MAIN_TAB_ID, prompt);
  }

  // ───────────────────────── 标签 ─────────────────────────

  private requireTab(id: string): HarnessTabMeta {
    const tab = this.tabs.get(String(id));
    if (!tab) throw new Error(t('标签不存在'));
    return tab;
  }

  listTabs(): HarnessTabsState {
    const tabs = [...this.tabs.values()];
    return {
      tabs: tabs.map((x) => ({ ...x })),
      activeTabId: this.activeTabId,
      maxConcurrent: this.maxConcurrent,
      running: tabs.filter((x) => x.status === 'running').length,
      queued: tabs.filter((x) => x.status === 'queued').length,
    };
  }

  createTab(opts: { backend?: HarnessBackend; cwd?: string; title?: string } = {}): HarnessTabMeta {
    const backend = opts.backend ?? 'claude';
    if (!isBackend(backend) || backend === 'nomi') {
      throw new Error(t('新标签只能绑定编程助手后端'));
    }
    const cwd = opts.cwd ? validDir(opts.cwd) : this.tabs.get(this.activeTabId)!.cwd;
    const now = Date.now();
    const sameKind = [...this.tabs.values()].filter((x) => x.backend === backend).length;
    const tab: HarnessTabMeta = {
      id: randomUUID(),
      title:
        opts.title?.trim().slice(0, 60) ||
        (sameKind ? `${BACKEND_TITLE[backend]} ${sameKind + 1}` : BACKEND_TITLE[backend]),
      backend,
      cwd,
      cliSessionId: null,
      status: 'idle',
      unread: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.tabs.set(tab.id, tab);
    this.messages.set(tab.id, []);
    this.activeTabId = tab.id;
    this.changed();
    return { ...tab };
  }

  closeTab(id: string): HarnessTabsState {
    if (id === MAIN_TAB_ID) throw new Error(t('主对话标签不能关闭'));
    this.requireTab(id);
    this.cancelTab(id);
    const order = [...this.tabs.keys()];
    const idx = order.indexOf(id);
    this.tabs.delete(id);
    this.messages.delete(id);
    try {
      fs.rmSync(this.messagesPath(id), { force: true });
    } catch {
      /* */
    }
    if (this.activeTabId === id) {
      const rest = order.filter((x) => x !== id);
      this.activeTabId = rest[Math.max(0, idx - 1)] ?? MAIN_TAB_ID;
    }
    this.changed();
    return this.listTabs();
  }

  renameTab(id: string, title: string): HarnessTabMeta {
    const tab = this.requireTab(id);
    const next = String(title ?? '')
      .trim()
      .slice(0, 60);
    if (!next) throw new Error(t('标题不能为空'));
    tab.title = next;
    this.changed();
    return { ...tab };
  }

  setActiveTab(id: string): HarnessTabsState {
    const tab = this.requireTab(id);
    this.activeTabId = tab.id;
    tab.unread = 0;
    this.changed();
    return this.listTabs();
  }

  setTabBackend(id: string, backend: HarnessBackend): HarnessTabMeta {
    const tab = this.requireTab(id);
    if (!isBackend(backend)) throw new Error(t('未知后端'));
    if (backend === 'nomi' && id !== MAIN_TAB_ID) {
      throw new Error(t('新标签只能绑定编程助手后端'));
    }
    if (tab.status === 'running' || tab.status === 'queued') throw new Error(t('上一轮尚未结束'));
    // 会话 id 只属于产生它的 CLI；切换后端即丢弃，避免把 Claude 会话交给 Codex resume
    if (backend !== tab.backend) tab.cliSessionId = null;
    tab.backend = backend;
    this.changed();
    return { ...tab };
  }

  setTabCwd(id: string, cwd: string): HarnessTabMeta {
    const tab = this.requireTab(id);
    const abs = validDir(cwd);
    // dsh / Codex 的续接与 cwd 绑定：换目录即开新会话
    if (abs !== tab.cwd) tab.cliSessionId = null;
    tab.cwd = abs;
    this.changed();
    return { ...tab };
  }

  async pickTabCwd(id: string): Promise<HarnessTabMeta> {
    const tab = this.requireTab(id);
    const r = await dialog.showOpenDialog({
      title: t('选择编程助手工作目录'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: tab.cwd,
    });
    if (r.canceled || !r.filePaths[0]) return { ...tab };
    return this.setTabCwd(id, r.filePaths[0]);
  }

  setMaxConcurrent(n: number): HarnessTabsState {
    this.maxConcurrent = clampLimit(n);
    this.pump();
    this.changed();
    return this.listTabs();
  }

  /** 中止标签当前轮次（排队中的直接出队） */
  cancelTab(id: string): boolean {
    const child = this.children.get(id);
    if (child) {
      child.kill();
      return true;
    }
    return false;
  }

  /** 发送一轮到指定标签；多个标签并发，超出上限排队 */
  async sendTab(id: string, prompt: string): Promise<HarnessSendResult> {
    const tab = this.requireTab(id);
    if (tab.backend === 'nomi') throw new Error(t('当前为 Nomi 后端，请走原生对话'));
    if (tab.status === 'running' || tab.status === 'queued') throw new Error(t('上一轮尚未结束'));
    const text = String(prompt ?? '').slice(0, 100_000);
    if (!text.trim()) throw new Error(t('消息为空'));
    const backend = tab.backend;
    this.appendMessage(id, {
      id: randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });
    tab.status = 'queued';
    tab.lastError = undefined;
    this.changed();
    await this.acquire();
    // 排队期间标签可能被关闭
    if (!this.tabs.has(id)) {
      this.release();
      throw new Error(t('标签已关闭'));
    }
    tab.status = 'running';
    this.changed();
    try {
      const result =
        backend === 'claude'
          ? await this.runClaude(tab, text)
          : backend === 'dsh'
            ? await this.runDsh(tab, text)
            : await this.runCodex(tab, text);
      if (result.sessionId && tab.backend === backend) tab.cliSessionId = result.sessionId;
      tab.status = 'idle';
      const tools = result.events
        .filter((e): e is Extract<HarnessEvent, { type: 'tool' }> => e.type === 'tool')
        .filter((e) => e.status === 'start')
        .map((e) => e.name);
      this.appendMessage(id, {
        id: randomUUID(),
        role: 'assistant',
        content: result.text,
        timestamp: Date.now(),
        ...(tools.length ? { tools } : {}),
      });
      this.finish(tab, true, result.text);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (this.tabs.has(id)) {
        tab.status = 'error';
        tab.lastError = message;
        this.appendMessage(id, {
          id: randomUUID(),
          role: 'assistant',
          content: message,
          timestamp: Date.now(),
          error: true,
        });
        this.finish(tab, false, '', message);
      }
      throw e;
    } finally {
      this.release();
    }
  }

  private finish(tab: HarnessTabMeta, ok: boolean, text: string, error?: string) {
    const background = this.activeTabId !== tab.id || !anyWindowFocused();
    if (background && tab.id !== MAIN_TAB_ID) tab.unread += 1;
    this.changed();
    const ev: HarnessTabFinished = {
      tabId: tab.id,
      title: tab.title,
      backend: tab.backend,
      ok,
      text,
      error,
      background,
    };
    this.events.emit('tab-finished', ev);
  }

  // ───────────────────────── 并发控制 ─────────────────────────

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.running += 1;
        resolve();
      });
    });
  }

  private release() {
    this.running = Math.max(0, this.running - 1);
    this.pump();
  }

  private pump() {
    while (this.running < this.maxConcurrent && this.waiters.length) this.waiters.shift()!();
  }

  // ───────────────────────── CLI 适配器 ─────────────────────────

  private runClaude(tab: HarnessTabMeta, prompt: string): Promise<HarnessSendResult> {
    const bin = resolveHarnessBin('claude');
    if (!bin) return Promise.reject(new Error(t('未找到 Claude Code（可设 NOMI_USE_MOCK_CLI=1）')));
    const useNode = isScript(bin);
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
    if (tab.cliSessionId && !useNode) argv.push('--resume', tab.cliSessionId);
    return this.spawnCollect(tab, {
      cmd: useNode ? process.execPath : bin,
      argv,
      parseLine: parseClaudeLine,
      kind: 'claude',
    });
  }

  private runCodex(tab: HarnessTabMeta, prompt: string): Promise<HarnessSendResult> {
    const bin = resolveHarnessBin('codex');
    if (!bin) return Promise.reject(new Error(t('未找到 Codex（可设 NOMI_USE_MOCK_CLI=1）')));
    const useNode = isScript(bin);
    // `exec resume` 不接受 --cd；工作目录由 spawn 的 cwd 决定
    const argv = useNode
      ? [bin, 'exec', '--json', prompt]
      : tab.cliSessionId
        ? ['exec', 'resume', '--json', '--skip-git-repo-check', tab.cliSessionId, prompt]
        : ['exec', '--json', '--skip-git-repo-check', '--cd', tab.cwd, prompt];
    return this.spawnCollect(tab, {
      cmd: useNode ? process.execPath : bin,
      argv,
      parseLine: parseCodexLine,
      kind: 'codex',
    });
  }

  /**
   * dsh 无头模式：`dsh --profile headless --json [--session-id id] <prompt>`。
   * 续接要求同一 cwd；Mock（.mjs）也收到完整参数，便于测试会话转发。
   */
  private runDsh(tab: HarnessTabMeta, prompt: string): Promise<HarnessSendResult> {
    const bin = resolveHarnessBin('dsh');
    if (!bin) return Promise.reject(new Error(t('未找到 dsh（可设 NOMI_USE_MOCK_CLI=1）')));
    const useNode = isScript(bin);
    const argv = ['--profile', 'headless', '--json'];
    if (tab.cliSessionId) argv.push('--session-id', tab.cliSessionId);
    // 以 - 开头的提示会被当成参数，前置空格规避
    argv.push(prompt.startsWith('-') ? ` ${prompt}` : prompt);
    let extraEnv: Record<string, string> = {};
    try {
      extraEnv = this.d.dshEnv?.() ?? {};
    } catch (e) {
      this.d.logger.warn('harness dsh env failed', e);
    }
    return this.spawnCollect(tab, {
      cmd: useNode ? process.execPath : bin,
      argv: useNode ? [bin, ...argv] : argv,
      parseLine: createDshParser(),
      kind: 'dsh',
      env: extraEnv,
    });
  }

  private spawnCollect(
    tab: HarnessTabMeta,
    opts: {
      cmd: string;
      argv: string[];
      parseLine: (line: string) => HarnessEvent[];
      kind: CliBackend;
      env?: Record<string, string>;
    },
  ): Promise<HarnessSendResult> {
    return new Promise((resolve, reject) => {
      const events: HarnessEvent[] = [];
      let text = '';
      let sessionId: string | null = tab.cliSessionId;
      let buf = '';
      let lastError: string | null = null;
      const child: ChildProcessWithoutNullStreams = spawn(opts.cmd, opts.argv, {
        cwd: tab.cwd,
        env: {
          ...process.env,
          NO_COLOR: '1',
          ...opts.env,
          // 不向 CLI 泄漏无关的 NOMI_* token；保留 PATH / HOME / 用户已有 ANTHROPIC_/OPENAI_
        },
        windowsHide: true,
      });
      this.children.set(tab.id, child);

      // 真实 CLI 在 stdin 为管道时会等待 EOF 读取附加输入（codex exec 会一直挂起）
      child.stdin.end();

      const take = (line: string, live: boolean) => {
        for (const ev of opts.parseLine(line)) {
          events.push(ev);
          if (live) this.emitEvent(tab.id, ev);
          if (ev.type === 'text-delta' || ev.type === 'text') text += ev.text;
          if (ev.type === 'error') lastError = ev.message;
          if (ev.type === 'done') {
            if (ev.text) text = ev.text;
            if (ev.sessionId) sessionId = ev.sessionId;
          }
        }
      };
      child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const parts = buf.split(/\r?\n/);
        buf = parts.pop() ?? '';
        for (const line of parts) take(line, true);
      });
      child.stderr.on('data', (c) => {
        this.d.logger.warn(`harness ${opts.kind} stderr`, String(c).slice(0, 500));
      });
      child.on('error', (e) => {
        this.children.delete(tab.id);
        reject(e);
      });
      child.on('close', (code, signal) => {
        this.children.delete(tab.id);
        if (buf.trim()) take(buf, false);
        if (signal && !text) {
          reject(new Error(t('已中止')));
          return;
        }
        // dsh 在 Node < 24 下不报错、无输出、退出码 0
        if (opts.kind === 'dsh' && events.length === 0 && !code) {
          reject(
            new Error(
              t(
                'dsh 没有任何输出：需要 Node ≥ {0}（当前 PATH 上的 Node 为 {1}）',
                DSH_MIN_NODE_MAJOR,
                readPathNodeVersion() ?? t('未找到'),
              ),
            ),
          );
          return;
        }
        if (code && code !== 0 && !text) {
          reject(new Error(lastError ?? t('{0} 退出码 {1}', opts.kind, code)));
          return;
        }
        resolve({ text: text || t('（无文本输出）'), sessionId, events });
      });
    });
  }

  // ───────────────────────── 广播 / IPC ─────────────────────────

  private post(channel: string, payload: unknown) {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send(channel, payload);
      } catch {
        /* */
      }
    }
  }

  private emitEvent(tabId: string, ev: HarnessEvent) {
    this.post('ai:harness:event', { ...ev, tabId });
    this.events.emit('event', { tabId, event: ev });
  }

  private changed() {
    this.persist();
    this.post('ai:harness:changed', this.state());
    const tabs = this.listTabs();
    this.post('ai:harness:tabs', tabs);
    this.events.emit('tabs', tabs);
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
    handle('ai:harness:tabs', () => this.listTabs());
    handle('ai:harness:tab-create', (o) =>
      this.createTab((o ?? {}) as { backend?: HarnessBackend; cwd?: string; title?: string }),
    );
    handle('ai:harness:tab-close', (id) => this.closeTab(String(id)));
    handle('ai:harness:tab-rename', (id, title) => this.renameTab(String(id), String(title)));
    handle('ai:harness:tab-activate', (id) => this.setActiveTab(String(id)));
    handle('ai:harness:tab-backend', (id, b) =>
      this.setTabBackend(String(id), b as HarnessBackend),
    );
    handle('ai:harness:tab-cwd', (id, c) => this.setTabCwd(String(id), String(c)));
    handle('ai:harness:tab-pick-cwd', (id) => this.pickTabCwd(String(id)));
    handle('ai:harness:tab-messages', (id) => this.tabMessages(String(id)));
    handle('ai:harness:tab-send', (id, p) => this.sendTab(String(id), String(p ?? '')));
    handle('ai:harness:tab-cancel', (id) => this.cancelTab(String(id)));
    handle('ai:harness:set-max-concurrent', (n) => this.setMaxConcurrent(Number(n)));
  }
}

function isScript(bin: string) {
  return bin.endsWith('.mjs') || bin.endsWith('.js');
}

function clampLimit(n: number): number {
  return Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : DEFAULT_MAX_CONCURRENT;
}

function validDir(cwd: string): string {
  const abs = path.resolve(String(cwd ?? ''));
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(t('工作目录无效'));
  }
  return abs;
}

function anyWindowFocused(): boolean {
  try {
    return BrowserWindow.getAllWindows().some((w) => w.isFocused?.());
  } catch {
    return false;
  }
}

let inst: CliHarnessService | null = null;
export function initCliHarnessService(
  d: ConstructorParameters<typeof CliHarnessService>[0],
): CliHarnessService {
  inst = new CliHarnessService(d);
  return inst;
}
export function getCliHarnessService(): CliHarnessService | null {
  return inst;
}
