/**
 * 用量与计费服务（主进程）：
 * - 采集：Nomi 对话（响应 usage，没有才估算并标「估算」）/ 本地路由经过的请求 / 编程工具会话日志；
 * - 存储：userData/usage/ledger.jsonl（只在本机，不上传）；设置 userData/usage/settings.json；
 * - 查询：汇总 / 趋势 / 分布 / 排行 / 热力图 / 明细 / CSV，费用按 USD 算、界面换算币种；
 * - 隐私：总开关、是否读取编程工具日志、保留时长、一键清空。
 */
import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, ipcMain } from 'electron';

import { isTrustedSenderUrl } from '../security/ipcSenderGuard';
import { writePrivateFile } from '../utils/privateFile';

import {
  breakdown,
  dateKey,
  details,
  heatmap,
  makePriceOf,
  rangeOf,
  series,
  summarize,
  toCsv,
  toRow,
  type DetailQuery,
  type Labels,
  type RangeId,
} from './aggregate';
import {
  BUILTIN_PRICES,
  DEFAULT_CNY_PER_USD,
  PRICING_TABLE_DATE,
  sanitizeCustomPrices,
} from './pricing';
import type { SniffedUsage } from './sniff';
import type { CustomPrice, Currency, UsageRecord, UsageSource } from './types';
import { UsageLedger, type Retention } from './UsageLedger';
import { UsageLogScanner } from './UsageLogScanner';

type Logger = { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

export interface UsageSettings {
  /** 总开关：关闭后不记录、不读取日志（已有数据保留，可一键清空） */
  enabled: boolean;
  /** 读取本机编程工具自己的会话日志（Claude Code / Codex / dsh …） */
  readToolLogs: boolean;
  retention: Retention;
  currency: Currency;
  /** 1 USD = ? CNY；默认只是占位常量，界面标注「可自定义」 */
  cnyPerUsd: number;
  /** 用户改价 / 新增的模型单价（USD / 1M tokens） */
  customPrices: CustomPrice[];
  /** 上次「一键清空」的时间（ms）；早于它的日志内容不再导入 */
  clearedAt: number;
}

export const DEFAULT_USAGE_SETTINGS: UsageSettings = {
  enabled: true,
  readToolLogs: true,
  retention: '1y',
  currency: 'USD',
  cnyPerUsd: DEFAULT_CNY_PER_USD,
  customPrices: [],
  clearedAt: 0,
};

export function sanitizeUsageSettings(
  raw: unknown,
  base: UsageSettings = DEFAULT_USAGE_SETTINGS,
): UsageSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<UsageSettings>;
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    enabled: b(o.enabled, base.enabled),
    readToolLogs: b(o.readToolLogs, base.readToolLogs),
    retention:
      o.retention === '90d' || o.retention === '1y' || o.retention === 'forever'
        ? o.retention
        : base.retention,
    currency: o.currency === 'CNY' || o.currency === 'USD' ? o.currency : base.currency,
    cnyPerUsd:
      typeof o.cnyPerUsd === 'number' && o.cnyPerUsd > 0 && o.cnyPerUsd < 1000
        ? o.cnyPerUsd
        : base.cnyPerUsd,
    customPrices:
      o.customPrices === undefined ? base.customPrices : sanitizeCustomPrices(o.customPrices),
    clearedAt: typeof o.clearedAt === 'number' && o.clearedAt >= 0 ? o.clearedAt : base.clearedAt,
  };
}

type Deps = {
  root: string;
  logger: Logger;
  home?: string;
  dshHome?: string;
  now?: () => number;
  /** 日志扫描间隔（ms），默认 60s；0 = 不自动扫描（测试） */
  scanMs?: number;
  /** Nomi 供应商 id → 显示名 */
  providerName?: (id: string) => string | undefined;
};

/** 一条调用的原始数据（主进程各采集点统一走这里） */
export interface UsageInput {
  ts: number;
  dur?: number;
  source: UsageSource;
  via: UsageRecord['via'];
  provider?: string;
  model: string;
  /** 输入 token 总数（含缓存部分）——Nomi 对话口径 */
  promptTokens: number;
  outputTokens: number;
  cacheRead?: number;
  cacheWrite?: number;
  est?: boolean;
  session?: string;
  project?: string;
  /** 去重键；不传则按来源 + 时间 + token 生成 */
  key?: string;
}

export class UsageService {
  readonly ledger: UsageLedger;
  private settings: UsageSettings = { ...DEFAULT_USAGE_SETTINGS };
  private readonly settingsPath: string;
  private readonly scanner: UsageLogScanner;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScanAt = 0;
  private scanning = false;
  /** 正在经过本地路由的请求数（按来源）：这段时间不读该来源的日志，避免同一次请求记两份 */
  private readonly routeInflight = new Map<UsageSource, number>();
  private seq = 0;
  private listeners = new Set<(r: UsageRecord) => void>();

  constructor(private readonly d: Deps) {
    fs.mkdirSync(d.root, { recursive: true });
    this.settingsPath = path.join(d.root, 'settings.json');
    this.load();
    this.ledger = new UsageLedger({ root: d.root, logger: d.logger, now: d.now });
    this.scanner = new UsageLogScanner({
      ledger: this.ledger,
      home: d.home,
      dshHome: d.dshHome,
      now: d.now,
      logger: d.logger,
      retention: () => this.settings.retention,
      clearedAt: () => this.settings.clearedAt,
      routeBusy: (s) => (this.routeInflight.get(s) ?? 0) > 0,
    });
    this.ledger.prune(this.settings.retention);
  }

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  private load(): void {
    try {
      this.settings = sanitizeUsageSettings(JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')));
    } catch {
      this.settings = sanitizeUsageSettings({});
    }
  }

  private save(): void {
    writePrivateFile(this.settingsPath, JSON.stringify(this.settings, null, 2));
  }

  getSettings(): UsageSettings {
    return this.settings;
  }

  setSettings(patch: Partial<UsageSettings>): UsageSettings {
    const prev = this.settings;
    this.settings = sanitizeUsageSettings({ ...prev, ...patch, clearedAt: prev.clearedAt }, prev);
    this.save();
    if (this.settings.retention !== prev.retention) this.ledger.prune(this.settings.retention);
    if (this.settings.enabled && this.settings.readToolLogs) this.start();
    else this.stopTimers();
    this.changed();
    return this.settings;
  }

  // ---------------------------------------------------------------- 采集

  /** 记一次调用（Nomi 对话 / 本地路由）。总开关关闭时直接丢弃。 */
  record(i: UsageInput): UsageRecord | null {
    if (!this.settings.enabled) return null;
    const cacheRead = Math.max(0, i.cacheRead ?? 0);
    const cacheWrite = Math.max(0, i.cacheWrite ?? 0);
    const rec: UsageRecord = {
      key: i.key ?? `${i.source}:${i.via}:${i.ts}:${++this.seq}`,
      ts: i.ts,
      ...(i.dur ? { dur: i.dur } : {}),
      source: i.source,
      via: i.via,
      ...(i.provider ? { provider: i.provider } : {}),
      model: i.model || 'unknown',
      input: Math.max(0, i.promptTokens - cacheRead - cacheWrite),
      output: Math.max(0, i.outputTokens),
      cacheRead,
      cacheWrite,
      ...(i.session ? { session: i.session } : {}),
      ...(i.project ? { project: i.project } : {}),
      ...(i.est ? { est: true } : {}),
    };
    if (!rec.input && !rec.output && !rec.cacheRead && !rec.cacheWrite) return null;
    if (!this.ledger.upsert(rec)) return null;
    this.afterRecord(rec);
    return rec;
  }

  /** 本地路由：请求开始 / 结束（结束时带上从响应里取到的 usage） */
  routeBegin(source: UsageSource): void {
    this.routeInflight.set(source, (this.routeInflight.get(source) ?? 0) + 1);
  }

  routeEnd(
    source: UsageSource,
    r: { startedAt: number; provider?: string; model: string; usage: SniffedUsage | null },
  ): void {
    this.routeInflight.set(source, Math.max(0, (this.routeInflight.get(source) ?? 1) - 1));
    if (!r.usage) return;
    const u = r.usage;
    this.record({
      ts: r.startedAt,
      dur: Math.max(0, this.now() - r.startedAt),
      source,
      via: 'route',
      provider: r.provider,
      model: u.model || r.model,
      promptTokens: u.input + u.cacheRead + u.cacheWrite,
      outputTokens: u.output,
      cacheRead: u.cacheRead,
      cacheWrite: u.cacheWrite,
    });
  }

  /** 订阅新增记录（预算提醒 / 联动用） */
  onRecord(fn: (r: UsageRecord) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private afterRecord(rec: UsageRecord): void {
    for (const fn of this.listeners) {
      try {
        fn(rec);
      } catch (e) {
        this.d.logger.warn('usage listener failed', String(e));
      }
    }
    this.changed();
  }

  // ---------------------------------------------------------------- 日志扫描

  start(): void {
    if (this.scanTimer || !this.settings.enabled || !this.settings.readToolLogs) return;
    const ms = this.d.scanMs ?? 60_000;
    if (ms <= 0) return;
    // 启动后稍等一会再首扫，让出启动高峰
    const first = setTimeout(() => void this.scan(), 5_000);
    (first as { unref?: () => void }).unref?.();
    this.scanTimer = setInterval(() => void this.scan(), ms);
    (this.scanTimer as { unref?: () => void }).unref?.();
    if (!this.pruneTimer) {
      this.pruneTimer = setInterval(() => this.ledger.prune(this.settings.retention), 6 * 3600_000);
      (this.pruneTimer as { unref?: () => void }).unref?.();
    }
  }

  private stopTimers(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.scanTimer = null;
  }

  stop(): void {
    this.stopTimers();
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = null;
    this.ledger.flush();
  }

  async scan(): Promise<{ added: number; files: number }> {
    if (!this.settings.enabled || !this.settings.readToolLogs || this.scanning)
      return { added: 0, files: 0 };
    this.scanning = true;
    try {
      const before = this.ledger.size();
      const r = await this.scanner.scan();
      this.lastScanAt = this.now();
      if (r.added || this.ledger.size() !== before) {
        this.changed();
        this.notifyLogRecords();
      }
      return r;
    } catch (e) {
      this.d.logger.warn('usage scan failed', String(e));
      return { added: 0, files: 0 };
    } finally {
      this.scanning = false;
    }
  }

  /** 日志导入的记录也要让监听方（预算提醒）看到最新状态：用一条空通知触发重算 */
  private notifyLogRecords(): void {
    for (const fn of this.listeners) {
      try {
        fn({
          key: '',
          ts: this.now(),
          source: 'other',
          via: 'log',
          model: '',
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        });
      } catch {
        /* */
      }
    }
  }

  // ---------------------------------------------------------------- 查询

  private priceOf() {
    return makePriceOf(this.settings.customPrices);
  }

  private labels(): Labels {
    return { providerName: (id) => this.d.providerName?.(id) };
  }

  state() {
    return {
      settings: this.settings,
      detected: this.scanner.detected(),
      records: this.ledger.size(),
      lastScanAt: this.lastScanAt,
      pricing: {
        date: PRICING_TABLE_DATE,
        builtin: BUILTIN_PRICES.map((p) => ({ ...p })),
      },
    };
  }

  query(rangeId: RangeId) {
    const now = this.now();
    const range = rangeOf(rangeId, now);
    const priceOf = this.priceOf();
    // 一次取「上一周期起点 → 现在」，再切两段
    const recs = this.ledger.range(range.prevFrom, range.to);
    const cur = recs.filter((r) => r.ts >= range.from);
    const prev = recs.filter((r) => r.ts < range.from);
    return {
      range: { id: range.id, from: range.from, to: range.to, bucket: range.bucket },
      summary: summarize(cur, priceOf),
      prev: summarize(prev, priceOf),
      series: series(cur, range, priceOf),
      bySource: breakdown(cur, 'source', priceOf, this.labels()),
      byProvider: breakdown(cur, 'provider', priceOf, this.labels()),
      byModel: breakdown(cur, 'model', priceOf, this.labels()),
    };
  }

  heatmap() {
    const now = this.now();
    const days = heatmap(this.ledger.all(), now, this.priceOf());
    return { days, today: dateKey(now) };
  }

  details(q: DetailQuery) {
    return details(this.ledger.all(), q, this.priceOf(), this.labels());
  }

  csv(q: DetailQuery): string {
    const recs = this.ledger
      .all()
      .filter(
        (r) =>
          r.ts >= q.from &&
          r.ts < q.to &&
          (!q.source || r.source === q.source) &&
          (!q.model || r.model === q.model) &&
          (!q.session || r.session === q.session),
      );
    const rows = recs.map((r) => toRow(r, this.priceOf(), this.labels()));
    rows.sort((a, b) => b.ts - a.ts);
    return toCsv(rows, this.settings.currency, this.settings.cnyPerUsd);
  }

  clear(): void {
    this.settings = { ...this.settings, clearedAt: this.now() };
    this.save();
    this.ledger.clear();
    this.changed();
  }

  // ---------------------------------------------------------------- IPC

  private changed(): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      for (const w of BrowserWindow.getAllWindows()) {
        if (w.isDestroyed()) continue;
        w.webContents.send('ai:usage:changed', null);
      }
    }, 1500);
    (this.broadcastTimer as { unref?: () => void }).unref?.();
  }

  registerIpc(): void {
    const handle = (ch: string, fn: (...a: unknown[]) => unknown | Promise<unknown>) => {
      ipcMain.removeHandler(ch);
      ipcMain.handle(ch, async (e, ...a) => {
        try {
          const url = (e as { sender?: { getURL?: () => string } }).sender?.getURL?.();
          if (!isTrustedSenderUrl(url)) throw new Error('untrusted sender');
          return await fn(...a);
        } catch (err) {
          return { __error: { message: err instanceof Error ? err.message : String(err) } };
        }
      });
    };
    const rid = (v: unknown): RangeId =>
      v === 'today' || v === '7d' || v === '30d' || v === '90d' ? v : '7d';
    const dq = (v: unknown): DetailQuery => {
      const o = (v && typeof v === 'object' ? v : {}) as Partial<DetailQuery>;
      const now = this.now();
      const s = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
      return {
        from: typeof o.from === 'number' ? o.from : rangeOf('90d', now).from,
        to: typeof o.to === 'number' ? o.to : rangeOf('today', now).to,
        source: s(o.source),
        model: s(o.model),
        session: s(o.session),
        sort: o.sort,
        dir: o.dir === 'asc' ? 'asc' : 'desc',
        limit: typeof o.limit === 'number' ? o.limit : 100,
        offset: typeof o.offset === 'number' ? o.offset : 0,
      };
    };
    handle('ai:usage:state', () => this.state());
    handle('ai:usage:query', (r) => this.query(rid(r)));
    handle('ai:usage:heatmap', () => this.heatmap());
    handle('ai:usage:details', (q) => this.details(dq(q)));
    handle('ai:usage:csv', (q) => this.csv(dq(q)));
    handle('ai:usage:set-settings', (p) => this.setSettings((p ?? {}) as Partial<UsageSettings>));
    handle('ai:usage:scan', async () => {
      const r = await this.scan();
      return { ...r, ...this.state() };
    });
    handle('ai:usage:clear', () => {
      this.clear();
      return this.state();
    });
  }
}

let inst: UsageService | null = null;
export function initUsageService(d: Deps): UsageService {
  inst?.stop();
  inst = new UsageService(d);
  return inst;
}
export function getUsageService(): UsageService | null {
  return inst;
}
