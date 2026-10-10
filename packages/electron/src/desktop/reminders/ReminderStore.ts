import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 提醒：持久化在 <root>/reminders.json；调度器在主进程里跑（应用运行时到点触发）。
 * 应用关闭期间到期的提醒，下次启动时标记为 missed 并由看板娘一次性播报。
 */
export type ReminderStatus = 'pending' | 'fired' | 'missed' | 'cancelled' | 'done';

export interface Reminder {
  id: string;
  text: string;
  dueAt: number;
  createdAt: number;
  status: ReminderStatus;
  firedAt?: number;
  snoozes?: number;
  /** missed 是否已经播报过 */
  announced?: boolean;
}

export const REMINDER_ID = /^r[0-9a-z]{6,24}$/;
/** 启动时离到期时间不足这么久的不算错过，直接正常触发 */
const MISSED_GRACE_MS = 60_000;
/** setTimeout 上限（约 24.8 天）以内分段等待 */
const MAX_WAIT = 2 ** 31 - 1;
const KEEP_DONE = 200;

export interface SchedulerTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export class ReminderStore {
  private items: Reminder[] = [];
  private timer: unknown = null;
  private readonly listeners = new Set<() => void>();
  onFire: ((r: Reminder) => void) | null = null;

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
    private readonly timers: SchedulerTimers = {
      setTimeout: (f, ms) => setTimeout(f, ms),
      clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    },
  ) {
    this.items = this.read();
  }

  private read(): Reminder[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { reminders?: unknown };
      if (!Array.isArray(raw.reminders)) return [];
      return raw.reminders.filter(
        (r): r is Reminder =>
          !!r &&
          typeof (r as Reminder).id === 'string' &&
          REMINDER_ID.test((r as Reminder).id) &&
          typeof (r as Reminder).text === 'string' &&
          typeof (r as Reminder).dueAt === 'number',
      );
    } catch {
      return [];
    }
  }

  private save(): void {
    // 只保留最近的已结束记录
    const active = this.items.filter((r) => r.status === 'pending');
    const ended = this.items
      .filter((r) => r.status !== 'pending')
      .sort((a, b) => b.dueAt - a.dueAt)
      .slice(0, KEEP_DONE);
    this.items = [...active, ...ended];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, reminders: this.items }, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(tmp, this.file);
    for (const l of this.listeners) l();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 启动：把关闭期间错过的标记为 missed，返回尚未播报的错过提醒；然后开始调度 */
  start(): Reminder[] {
    const t = this.now();
    let changed = false;
    for (const r of this.items) {
      if (r.status === 'pending' && r.dueAt < t - MISSED_GRACE_MS) {
        r.status = 'missed';
        changed = true;
      }
    }
    if (changed) this.save();
    this.schedule();
    return this.items.filter((r) => r.status === 'missed' && !r.announced);
  }

  markAnnounced(ids: string[]): void {
    let changed = false;
    for (const r of this.items)
      if (ids.includes(r.id) && !r.announced) {
        r.announced = true;
        changed = true;
      }
    if (changed) this.save();
  }

  stop(): void {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.stop();
    const next = this.items
      .filter((r) => r.status === 'pending')
      .reduce<Reminder | null>((a, r) => (!a || r.dueAt < a.dueAt ? r : a), null);
    if (!next) return;
    const wait = Math.max(0, Math.min(MAX_WAIT, next.dueAt - this.now()));
    this.timer = this.timers.setTimeout(() => this.tick(), wait);
  }

  /** 触发所有到期的提醒（也供测试直接调用） */
  tick(): void {
    this.timer = null;
    const t = this.now();
    const due = this.items.filter((r) => r.status === 'pending' && r.dueAt <= t);
    for (const r of due) {
      r.status = 'fired';
      r.firedAt = t;
    }
    if (due.length) this.save();
    for (const r of due) {
      try {
        this.onFire?.(r);
      } catch {
        /* 单个提醒的展示失败不影响其它 */
      }
    }
    this.schedule();
  }

  create(text: string, dueAt: number): Reminder {
    const t = this.now();
    const r: Reminder = {
      id: `r${t.toString(36)}${randomBytes(3).toString('hex')}`,
      text: text.trim().slice(0, 500),
      dueAt: Math.round(dueAt),
      createdAt: t,
      status: 'pending',
    };
    this.items.push(r);
    this.save();
    this.schedule();
    return r;
  }

  get(id: string): Reminder | null {
    return this.items.find((r) => r.id === id) ?? null;
  }

  list(i: { includeEnded?: boolean; limit?: number } = {}): Reminder[] {
    return this.items
      .filter((r) => i.includeEnded || r.status === 'pending')
      .sort((a, b) =>
        a.status === 'pending' && b.status === 'pending' ? a.dueAt - b.dueAt : b.dueAt - a.dueAt,
      )
      .slice(0, i.limit ?? 100)
      .map((r) => ({ ...r }));
  }

  private mutate(id: string, fn: (r: Reminder) => void): { before: Reminder; after: Reminder } {
    const r = this.get(id);
    if (!r) throw Object.assign(new Error('提醒不存在'), { code: 'not_found' });
    const before = { ...r };
    fn(r);
    this.save();
    this.schedule();
    return { before, after: { ...r } };
  }

  cancel(id: string) {
    return this.mutate(id, (r) => {
      if (r.status !== 'pending')
        throw Object.assign(new Error('只能取消尚未触发的提醒'), { code: 'invalid_state' });
      r.status = 'cancelled';
    });
  }

  /** 稍后提醒：已触发 / 错过 / 待触发的都可以，改成 now + minutes */
  snooze(id: string, minutes: number) {
    return this.mutate(id, (r) => {
      if (r.status === 'cancelled')
        throw Object.assign(new Error('提醒已取消'), { code: 'invalid_state' });
      r.status = 'pending';
      r.dueAt = this.now() + Math.round(minutes * 60_000);
      r.snoozes = (r.snoozes ?? 0) + 1;
      delete r.firedAt;
    });
  }

  dismiss(id: string) {
    return this.mutate(id, (r) => {
      if (r.status === 'fired' || r.status === 'missed') r.status = 'done';
    });
  }

  /** 原样写回（撤销用） */
  restore(snapshot: Reminder): void {
    const i = this.items.findIndex((r) => r.id === snapshot.id);
    if (i >= 0) this.items[i] = { ...snapshot };
    else this.items.push({ ...snapshot });
    this.save();
    this.schedule();
  }
}

/** 解析到期时间：at（ISO / 本地时间字符串）或 in（秒 / 分钟），返回毫秒时间戳 */
export function resolveDue(
  i: { at?: string; inMinutes?: number; inSeconds?: number },
  now: number,
): number | null {
  if (typeof i.inSeconds === 'number') return now + i.inSeconds * 1000;
  if (typeof i.inMinutes === 'number') return now + i.inMinutes * 60_000;
  if (i.at) {
    const t = Date.parse(i.at);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}
