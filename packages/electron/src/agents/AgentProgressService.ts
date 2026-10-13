/**
 * 编程助手进度监视：只读本机 Codex / Claude Code / Aider / Cline / Continue / Cursor
 * 已暴露的日志与会话文件，状态变化时通过看板娘气泡提醒。绝不刮取远端账号。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BrowserWindow, Notification, ipcMain } from 'electron';

import { broadcastMascotCommand } from '../ai/mascotCommand';
import type { DesktopService } from '../desktop/DesktopService';
import { t as tr } from '../i18n';

import {
  type AgentKind,
  type AgentStatus,
  parseAiderAnalytics,
  parseAiderHistory,
  parseClaudeTail,
  parseClineJob,
  parseCodexTail,
  parseContinueSession,
  parseCursorHeuristic,
  readTail,
} from './parsers';

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

export interface AgentWatchSettings {
  enabled: boolean;
  /** 多久无写入视为卡住 */
  stallMs: number;
  /** 同工具同状态最短提醒间隔 */
  cooldownMs: number;
  osNotify: boolean;
  tools: Record<AgentKind, boolean>;
}

export const DEFAULT_AGENT_WATCH: AgentWatchSettings = {
  enabled: true,
  stallMs: 5 * 60_000,
  cooldownMs: 90_000,
  osNotify: false,
  tools: {
    codex: true,
    claude: true,
    aider: true,
    cline: true,
    continue: true,
    cursor: true,
  },
};

export interface AgentSessionView {
  id: string;
  kind: AgentKind;
  label: string;
  status: AgentStatus;
  summary?: string;
  path: string;
  mtime: number;
  updatedAt: number;
}

export interface AgentWatchState {
  settings: AgentWatchSettings;
  sessions: AgentSessionView[];
  detected: AgentKind[];
  lastRemindAt: number;
}

interface Tracked {
  id: string;
  kind: AgentKind;
  label: string;
  path: string;
  status: AgentStatus;
  summary?: string;
  mtime: number;
  updatedAt: number;
  lastRemindStatus?: AgentStatus;
  lastRemindAt: number;
}

type Deps = {
  root: string;
  logger: Logger;
  desktop: DesktopService;
  home?: string;
  now?: () => number;
  pollMs?: number;
};

const LABEL: Record<AgentKind, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  aider: 'Aider',
  cline: 'Cline',
  continue: 'Continue',
  cursor: 'Cursor',
};

const REMIND: Record<AgentStatus, (label: string, summary?: string) => string> = {
  running: (l, s) => tr('{0} 还在忙：{1}', l, s || tr('处理中…')),
  completed: (l, s) => tr('{0} 做完啦～{1}', l, s ? ` ${s}` : ''),
  failed: (l, s) => tr('{0} 出错了：{1}', l, s || tr('请看看终端')),
  stalled: (l) => tr('{0} 好像卡住了，要不要去看看？', l),
  idle: () => '',
};

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function listFiles(dir: string, pred: (n: string) => boolean, depth = 3): string[] {
  const out: string[] = [];
  const walk = (d: string, dep: number) => {
    if (dep < 0 || out.length > 80) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, dep - 1);
      else if (e.isFile() && pred(e.name)) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir, depth);
  return out;
}

function readFileSafe(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

export function sanitizeAgentWatch(raw: unknown, base = DEFAULT_AGENT_WATCH): AgentWatchSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<AgentWatchSettings>;
  const tools = { ...base.tools, ...(o.tools ?? {}) };
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const n = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d);
  return {
    enabled: b(o.enabled, base.enabled),
    stallMs: n(o.stallMs, base.stallMs),
    cooldownMs: n(o.cooldownMs, base.cooldownMs),
    osNotify: b(o.osNotify, base.osNotify),
    tools: {
      codex: b(tools.codex, true),
      claude: b(tools.claude, true),
      aider: b(tools.aider, true),
      cline: b(tools.cline, true),
      continue: b(tools.continue, true),
      cursor: b(tools.cursor, true),
    },
  };
}

export class AgentProgressService {
  private settings: AgentWatchSettings = {
    ...DEFAULT_AGENT_WATCH,
    tools: { ...DEFAULT_AGENT_WATCH.tools },
  };
  private tracked = new Map<string, Tracked>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRemindAt = 0;
  private readonly home: string;
  private readonly now: () => number;
  private readonly pollMs: number;
  private readonly settingsPath: string;

  constructor(private readonly d: Deps) {
    this.home = d.home ?? os.homedir();
    this.now = d.now ?? (() => Date.now());
    this.pollMs = d.pollMs ?? 8_000;
    this.settingsPath = path.join(d.root, 'settings.json');
    fs.mkdirSync(d.root, { recursive: true });
    this.load();
  }

  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')) as unknown;
      this.settings = sanitizeAgentWatch(raw);
    } catch {
      this.settings = sanitizeAgentWatch({});
    }
  }

  private save() {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
  }

  state(): AgentWatchState {
    const sessions = [...this.tracked.values()]
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        label: t.label,
        status: t.status,
        summary: t.summary,
        path: t.path,
        mtime: t.mtime,
        updatedAt: t.updatedAt,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return {
      settings: this.settings,
      sessions,
      detected: this.detectKinds(),
      lastRemindAt: this.lastRemindAt,
    };
  }

  setSettings(
    patch: Partial<AgentWatchSettings> & { tools?: Partial<Record<AgentKind, boolean>> },
  ) {
    this.settings = sanitizeAgentWatch({
      ...this.settings,
      ...patch,
      tools: { ...this.settings.tools, ...(patch.tools ?? {}) },
    });
    this.save();
    if (this.settings.enabled) this.start();
    else this.stop();
    this.broadcast();
    return this.settings;
  }

  detectKinds(): AgentKind[] {
    const h = this.home;
    const found: AgentKind[] = [];
    if (fs.existsSync(path.join(h, '.codex'))) found.push('codex');
    if (fs.existsSync(path.join(h, '.claude'))) found.push('claude');
    if (
      fs.existsSync(path.join(h, '.aider')) ||
      fs.existsSync(path.join(h, '.aider.chat.history.md'))
    )
      found.push('aider');
    if (fs.existsSync(path.join(h, '.cline'))) found.push('cline');
    if (fs.existsSync(path.join(h, '.continue'))) found.push('continue');
    if (fs.existsSync(path.join(h, '.cursor'))) found.push('cursor');
    return found;
  }

  /** 扫描本机已知路径，返回候选会话文件 */
  scanFiles(): Array<{ kind: AgentKind; path: string; label: string }> {
    const h = this.home;
    const out: Array<{ kind: AgentKind; path: string; label: string }> = [];
    const { tools } = this.settings;

    if (tools.codex) {
      for (const p of listFiles(
        path.join(h, '.codex', 'sessions'),
        (n) => n.endsWith('.jsonl'),
        4,
      )) {
        out.push({ kind: 'codex', path: p, label: LABEL.codex });
      }
    }
    if (tools.claude) {
      for (const p of listFiles(
        path.join(h, '.claude', 'projects'),
        (n) => n.endsWith('.jsonl'),
        3,
      )) {
        out.push({ kind: 'claude', path: p, label: LABEL.claude });
      }
    }
    if (tools.aider) {
      const analytics = path.join(h, '.aider', 'analytics.jsonl');
      if (fs.existsSync(analytics))
        out.push({ kind: 'aider', path: analytics, label: LABEL.aider });
      const homeHist = path.join(h, '.aider.chat.history.md');
      if (fs.existsSync(homeHist)) out.push({ kind: 'aider', path: homeHist, label: LABEL.aider });
    }
    if (tools.cline) {
      for (const p of listFiles(
        path.join(h, '.cline'),
        (n) => n === 'job.json' || n.endsWith('.jsonl'),
        5,
      )) {
        out.push({ kind: 'cline', path: p, label: LABEL.cline });
      }
    }
    if (tools.continue) {
      for (const p of listFiles(
        path.join(h, '.continue', 'sessions'),
        (n) => n.endsWith('.json') && n !== 'sessions.json',
        1,
      )) {
        out.push({ kind: 'continue', path: p, label: LABEL.continue });
      }
    }
    if (tools.cursor) {
      for (const p of listFiles(
        path.join(h, '.cursor'),
        (n) =>
          n.includes('agent') && (n.endsWith('.jsonl') || n.endsWith('.txt') || n.endsWith('.log')),
        4,
      ).slice(0, 20)) {
        out.push({ kind: 'cursor', path: p, label: LABEL.cursor });
      }
    }
    return out;
  }

  private interpret(
    kind: AgentKind,
    filePath: string,
    st: fs.Stats,
  ): {
    status: AgentStatus;
    summary?: string;
  } {
    const age = this.now() - st.mtimeMs;
    const fresh = age < this.settings.stallMs * 2;
    const raw = readFileSafe(filePath);
    const tail = readTail(raw);

    let parsed =
      kind === 'codex'
        ? parseCodexTail(tail)
        : kind === 'claude'
          ? parseClaudeTail(tail)
          : kind === 'aider'
            ? filePath.endsWith('.jsonl')
              ? parseAiderAnalytics(tail)
              : parseAiderHistory(raw)
            : kind === 'cline'
              ? parseClineJob(path.basename(filePath) === 'job.json' ? raw : tail)
              : kind === 'continue'
                ? parseContinueSession(raw)
                : parseCursorHeuristic(fresh, age, this.settings.stallMs);

    if (parsed.status === 'running' && age > this.settings.stallMs) {
      parsed = {
        status: 'stalled',
        summary: parsed.summary || tr('{0} 长时间无更新', LABEL[kind]),
      };
    }
    if (parsed.status === 'idle' && fresh && age < 60_000) {
      parsed = { status: 'running', summary: tr('{0} 刚有活动', LABEL[kind]) };
    }
    return parsed;
  }

  tick(): void {
    if (!this.settings.enabled) return;
    const files = this.scanFiles();
    const seen = new Set<string>();
    const now = this.now();

    for (const f of files) {
      const st = safeStat(f.path);
      if (!st) continue;
      // 忽略太久没动的归档（超过 24h）
      if (now - st.mtimeMs > 24 * 60 * 60_000) continue;
      const id = `${f.kind}:${f.path}`;
      seen.add(id);
      const parsed = this.interpret(f.kind, f.path, st);
      const prev = this.tracked.get(id);
      const next: Tracked = {
        id,
        kind: f.kind,
        label: f.label,
        path: f.path,
        status: parsed.status,
        summary: parsed.summary,
        mtime: st.mtimeMs,
        updatedAt: now,
        lastRemindStatus: prev?.lastRemindStatus,
        lastRemindAt: prev?.lastRemindAt ?? 0,
      };
      this.tracked.set(id, next);
      this.maybeRemind(prev, next);
    }

    for (const id of [...this.tracked.keys()]) {
      if (!seen.has(id)) this.tracked.delete(id);
    }
    this.broadcast();
  }

  private maybeRemind(prev: Tracked | undefined, next: Tracked) {
    if (next.status === 'idle') return;
    // 首次发现且已是 completed/failed：不打扰（历史会话）
    if (!prev && (next.status === 'completed' || next.status === 'failed')) return;
    const changed = !prev || prev.status !== next.status;
    if (!changed && next.status !== 'stalled') return;
    if (next.status === 'running' && prev?.status === 'running') return;
    if (
      next.lastRemindStatus === next.status &&
      nowGap(next.lastRemindAt, this.now()) < this.settings.cooldownMs
    )
      return;

    const text = REMIND[next.status](next.label, next.summary);
    if (!text) return;
    this.d.desktop.say(text.slice(0, 140));
    broadcastMascotCommand({
      type: 'motion',
      name: next.status === 'failed' || next.status === 'stalled' ? 'think' : 'wave',
    });
    if (this.settings.osNotify) this.notify(next.label, text);
    next.lastRemindStatus = next.status;
    next.lastRemindAt = this.now();
    this.lastRemindAt = next.lastRemindAt;
    this.tracked.set(next.id, next);
    this.d.logger.info('agent-progress remind', { kind: next.kind, status: next.status });
  }

  private notify(title: string, body: string) {
    try {
      if (!Notification.isSupported()) return;
      new Notification({ title: `🛠 ${title}`, body: body.slice(0, 180) }).show();
    } catch (e) {
      this.d.logger.warn('agent notify failed', String(e));
    }
  }

  private broadcast() {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue;
      w.webContents.send('ai:agents:changed', null);
    }
  }

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (e) {
        this.d.logger.warn('agent-progress tick', String(e));
      }
    }, this.pollMs);
    if (typeof this.timer === 'object' && 'unref' in this.timer) this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  registerIpc(): void {
    const handle = (ch: string, fn: (...a: unknown[]) => unknown) => {
      ipcMain.removeHandler(ch);
      ipcMain.handle(ch, (_e, ...a) => {
        try {
          return fn(...a);
        } catch (err) {
          return { __error: { message: err instanceof Error ? err.message : String(err) } };
        }
      });
    };
    handle('ai:agents:state', () => this.state());
    handle('ai:agents:set-settings', (p) =>
      this.setSettings((p ?? {}) as Partial<AgentWatchSettings>),
    );
    handle('ai:agents:scan', () => {
      this.tick();
      return this.state();
    });
  }
}

function nowGap(from: number, to: number) {
  return Math.max(0, to - from);
}

let inst: AgentProgressService | null = null;
export function initAgentProgressService(d: Deps): AgentProgressService {
  inst = new AgentProgressService(d);
  return inst;
}
export function getAgentProgressService(): AgentProgressService | null {
  return inst;
}
