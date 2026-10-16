/**
 * 读取本机已安装编程工具自己的会话日志，补齐「不经过 Nomi」的用量。
 *
 * - 增量游标：jsonl 记住已读字节偏移，只读新增的完整行；文件变小 / 被替换才从头读。
 * - 整份 JSON / zstd 压缩的会话（Gemini、dsh）：按 size+mtime 判断是否变化，变了再整份解析（键去重）。
 * - 去重：记录带稳定键（消息 id / 累计值 / seq），账本同键只记一次；
 *   走了 Nomi 本地路由的请求以路由记录为准，日志里同一时段的同来源记录跳过。
 * - 首次扫描只看保留期内修改过的文件；每轮扫描让出事件循环，不卡主进程。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { zstdDecode } from '../cli/SessionHistoryService';

import {
  parseAiderChunk,
  parseClaudeChunk,
  parseCodexChunk,
  parseDshChunk,
  parseGeminiFile,
  type ParseState,
} from './logParsers';
import type { UsageRecord, UsageSource } from './types';
import { RETENTION_MS, type Retention, type UsageLedger } from './UsageLedger';

type Logger = { info?(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };

/** 单个文件一轮最多读多少字节（超大日志分多轮追平，避免一次占太多内存） */
const MAX_READ_PER_PASS = 8 * 1024 * 1024;
/** 整份解析（JSON / zstd）的体积上限 */
const MAX_WHOLE_FILE = 64 * 1024 * 1024;
const MAX_FILES_PER_KIND = 5000;
/** 没有保留期上限（永久）时，首次导入最多回看多久 */
const MAX_LOOKBACK_MS = 400 * 86_400_000;

export interface ScannerDeps {
  ledger: UsageLedger;
  home?: string;
  dshHome?: string;
  now?: () => number;
  logger?: Logger;
  /** 当前保留期：决定首次导入回看多久 */
  retention: () => Retention;
  /** 早于这个时间的记录不导入（一键清空的时刻） */
  clearedAt?: () => number;
  /** 这个来源现在有路由请求在飞：先别读它的日志（等路由记完账再说，避免同一次请求记两份） */
  routeBusy?: (source: UsageSource) => boolean;
  /** 新增 / 更新了一条记录（预算 / 单任务提醒用） */
  onNew?: (r: UsageRecord) => void;
}

interface Found {
  source: UsageSource;
  path: string;
  mtime: number;
  /** jsonl = 增量按行读；whole = 整份解析 */
  mode: 'jsonl' | 'whole';
}

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function walk(
  dir: string,
  pred: (name: string, full: string) => boolean,
  depth: number,
  since: number,
): Array<{ path: string; mtime: number }> {
  const out: Array<{ path: string; mtime: number }> = [];
  let visited = 0;
  const go = (d: string, dep: number) => {
    if (dep < 0 || visited > 50_000) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      visited++;
      const full = path.join(d, e.name);
      if (e.isDirectory()) go(full, dep - 1);
      else if (e.isFile() && pred(e.name, full)) {
        const st = safeStat(full);
        if (st && st.mtimeMs >= since) out.push({ path: full, mtime: st.mtimeMs });
      }
    }
  };
  go(dir, depth);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_FILES_PER_KIND);
}

const tick = () => new Promise<void>((r) => setImmediate(r));

export class UsageLogScanner {
  private readonly home: string;
  private readonly dshHome: string;
  private running = false;

  constructor(private readonly d: ScannerDeps) {
    this.home = d.home ?? os.homedir();
    this.dshHome =
      d.dshHome ??
      (process.env.DSH_HOME?.trim()
        ? path.resolve(process.env.DSH_HOME)
        : path.join(this.home, '.dsh'));
  }

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  /** 本机检测到的、能读用量日志的工具 */
  detected(): UsageSource[] {
    const h = this.home;
    const out: UsageSource[] = [];
    if (fs.existsSync(this.claudeDir())) out.push('claude');
    if (fs.existsSync(this.codexDir())) out.push('codex');
    if (fs.existsSync(path.join(this.dshHome, 'sessions'))) out.push('dsh');
    if (fs.existsSync(path.join(h, '.gemini'))) out.push('gemini');
    if (fs.existsSync(path.join(h, '.aider', 'analytics.jsonl'))) out.push('aider');
    return out;
  }

  private claudeDir(): string {
    const env = process.env.CLAUDE_CONFIG_DIR?.trim();
    return path.join(env ? path.resolve(env) : path.join(this.home, '.claude'), 'projects');
  }

  private codexDir(): string {
    const env = process.env.CODEX_HOME?.trim();
    return path.join(env ? path.resolve(env) : path.join(this.home, '.codex'), 'sessions');
  }

  /** 候选文件（各工具 mtime 倒序；只含回看窗口内修改过的） */
  find(): Found[] {
    const keep = RETENTION_MS[this.d.retention()];
    const since = this.now() - Math.min(keep, MAX_LOOKBACK_MS);
    const out: Found[] = [];
    const add = (
      source: UsageSource,
      mode: Found['mode'],
      list: Array<{ path: string; mtime: number }>,
    ) => {
      for (const f of list) out.push({ source, mode, ...f });
    };
    add(
      'claude',
      'jsonl',
      walk(this.claudeDir(), (n) => n.endsWith('.jsonl'), 4, since),
    );
    add(
      'codex',
      'jsonl',
      walk(this.codexDir(), (n) => n.endsWith('.jsonl'), 4, since),
    );
    // dsh：明文 jsonl 可增量；.zstd 要整份解压
    const dshFiles = walk(
      path.join(this.dshHome, 'sessions'),
      (n) => /^session\.v\d+\.jsonl(\.zstd)?$/.test(n),
      3,
      since,
    );
    add(
      'dsh',
      'jsonl',
      dshFiles.filter((f) => !f.path.endsWith('.zstd')),
    );
    add(
      'dsh',
      'whole',
      dshFiles.filter((f) => f.path.endsWith('.zstd')),
    );
    add(
      'gemini',
      'whole',
      walk(
        path.join(this.home, '.gemini', 'tmp'),
        (n, full) => /^session-.*\.json$/.test(n) && full.includes(`${path.sep}chats${path.sep}`),
        3,
        since,
      ),
    );
    const aider = path.join(this.home, '.aider', 'analytics.jsonl');
    const st = safeStat(aider);
    if (st && st.mtimeMs >= since) add('aider', 'jsonl', [{ path: aider, mtime: st.mtimeMs }]);
    return out;
  }

  /** 扫描一轮；返回新增 / 更新的记录数。重入时直接返回 0。 */
  async scan(): Promise<{ added: number; files: number }> {
    if (this.running) return { added: 0, files: 0 };
    this.running = true;
    let added = 0;
    let files = 0;
    try {
      for (const f of this.find()) {
        if (this.d.routeBusy?.(f.source)) continue;
        try {
          const n = f.mode === 'jsonl' ? await this.readJsonl(f) : await this.readWhole(f);
          if (n >= 0) files++;
          added += Math.max(0, n);
        } catch (e) {
          this.d.logger?.warn('usage scan file failed', {
            file: path.basename(f.path),
            e: String(e),
          });
        }
        await tick();
      }
    } finally {
      this.running = false;
    }
    return { added, files };
  }

  private ingest(recs: UsageRecord[]): number {
    const { ledger } = this.d;
    let n = 0;
    for (const r of recs) {
      if (!r.ts || r.ts < (this.d.clearedAt?.() ?? 0)) continue;
      if (r.source === 'claude' || r.source === 'codex') {
        const cover = ledger.routeCovering(r.source, r.ts);
        if (cover) {
          // 费用以路由记录为准；日志只补上它不知道的会话 / 项目，供「按会话统计」归属
          ledger.attribute(cover.key, { session: r.session, project: r.project });
          continue;
        }
      }
      if (ledger.upsert(r)) {
        n++;
        this.d.onNew?.(r);
      }
    }
    return n;
  }

  private parseChunk(source: UsageSource, text: string, state: ParseState): UsageRecord[] {
    switch (source) {
      case 'claude':
        return parseClaudeChunk(text);
      case 'codex':
        return parseCodexChunk(text, state);
      case 'dsh':
        return parseDshChunk(text, state);
      case 'aider':
        return parseAiderChunk(text);
      default:
        return [];
    }
  }

  /** 增量读 jsonl；返回新增条数，-1 = 没有变化（跳过） */
  private async readJsonl(f: Found): Promise<number> {
    const { ledger } = this.d;
    const st = safeStat(f.path);
    if (!st) return -1;
    let cur = ledger.cursor(f.path);
    if (cur && st.size < cur.offset) cur = undefined; // 被截断 / 替换：从头读
    if (cur && cur.offset >= st.size) {
      if (cur.size !== st.size || cur.mtimeMs !== st.mtimeMs)
        ledger.setCursor(f.path, { ...cur, size: st.size, mtimeMs: st.mtimeMs });
      return -1;
    }
    const state: ParseState = { ...(cur?.state ?? {}) };
    const startOffset = cur?.offset ?? 0;
    let offset = startOffset; // 已处理到的位置（只落在完整行末尾）
    let readPos = startOffset;
    let pending: Buffer = Buffer.alloc(0);
    let added = 0;
    const fh = await fs.promises.open(f.path, 'r');
    try {
      let budget = MAX_READ_PER_PASS;
      // 预算用完后，只要还没读到过一个完整行就继续（避免一行特别长时永远卡住）
      while (readPos < st.size && (budget > 0 || offset === startOffset)) {
        const len = Math.min(1024 * 1024, st.size - readPos);
        const buf = Buffer.alloc(len);
        const { bytesRead } = await fh.read(buf, 0, len, readPos);
        if (bytesRead <= 0) break;
        readPos += bytesRead;
        budget -= bytesRead;
        const data = Buffer.concat([pending, buf.subarray(0, bytesRead)]);
        const nl = data.lastIndexOf(0x0a);
        if (nl < 0) {
          pending = data;
          if (pending.length > MAX_WHOLE_FILE) {
            // 超长的单行（异常）：放弃这一行
            offset = readPos;
            pending = Buffer.alloc(0);
          }
          continue;
        }
        const complete = data.subarray(0, nl + 1);
        pending = data.subarray(nl + 1);
        offset += complete.length;
        added += this.ingest(this.parseChunk(f.source, complete.toString('utf8'), state));
        await tick();
      }
    } finally {
      await fh.close();
    }
    ledger.setCursor(f.path, { offset, size: st.size, mtimeMs: st.mtimeMs, state });
    return added;
  }

  /** 整份解析（Gemini JSON / dsh zstd）；返回新增条数，-1 = 没有变化 */
  private async readWhole(f: Found): Promise<number> {
    const { ledger } = this.d;
    const st = safeStat(f.path);
    if (!st) return -1;
    const cur = ledger.cursor(f.path);
    if (cur && cur.size === st.size && cur.mtimeMs === st.mtimeMs) return -1;
    if (st.size > MAX_WHOLE_FILE) {
      ledger.setCursor(f.path, { offset: st.size, size: st.size, mtimeMs: st.mtimeMs });
      return -1;
    }
    let recs: UsageRecord[] = [];
    if (f.source === 'gemini') {
      const text = await fs.promises.readFile(f.path, 'utf8');
      recs = parseGeminiFile(text);
    } else if (f.source === 'dsh') {
      const text = await zstdDecode(await fs.promises.readFile(f.path));
      recs = parseDshChunk(text, {});
    }
    const added = this.ingest(recs);
    ledger.setCursor(f.path, { offset: st.size, size: st.size, mtimeMs: st.mtimeMs });
    return added;
  }
}
