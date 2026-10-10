import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { type AppTrash, moveNoOverwrite } from './AppTrash';

/** 逆操作 */
export type InverseOp =
  | { op: 'move'; from: string; to: string }
  | { op: 'restore'; stored: string; original: string }
  | { op: 'trash'; path: string }
  | { op: 'truncate'; path: string; size: number; expectSize: number }
  /** 由注册的处理器执行（笔记内容回写、提醒状态恢复等非纯文件操作） */
  | { op: 'custom'; kind: string; payload: unknown };

export interface CustomUndo {
  /** 返回问题描述则不执行撤销 */
  check(payload: unknown): string | null;
  apply(payload: unknown): Promise<void> | void;
}

export interface JournalEntry {
  id: string;
  ts: number;
  tool: string;
  summary: string;
  /** 按顺序执行即可撤销 */
  inverse: InverseOp[];
}

interface UndoMark {
  undoOf: string;
  ts: number;
}

/** 撤销日志：userData/desktop/journal.jsonl（只追加；撤销本身也追加一条标记） */
export class UndoJournal {
  private readonly custom = new Map<string, CustomUndo>();

  registerCustom(kind: string, h: CustomUndo): void {
    this.custom.set(kind, h);
  }

  constructor(
    private readonly file: string,
    private readonly trash: AppTrash,
    private readonly now: () => number = Date.now,
  ) {}

  private read(): { entries: JournalEntry[]; undone: Set<string> } {
    const entries: JournalEntry[] = [];
    const undone = new Set<string>();
    if (!fs.existsSync(this.file)) return { entries, undone };
    for (const l of fs.readFileSync(this.file, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try {
        const o = JSON.parse(l) as JournalEntry | UndoMark;
        if ('undoOf' in o) undone.add(o.undoOf);
        else entries.push(o);
      } catch {
        /* skip */
      }
    }
    return { entries, undone };
  }

  record(tool: string, summary: string, inverse: InverseOp[]): JournalEntry {
    const e: JournalEntry = { id: randomUUID(), ts: this.now(), tool, summary, inverse };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(e)}\n`, { mode: 0o600 });
    return e;
  }

  list(limit = 50): Array<JournalEntry & { undone: boolean }> {
    const { entries, undone } = this.read();
    return entries
      .slice(-limit)
      .reverse()
      .map((e) => ({ ...e, undone: undone.has(e.id) }));
  }

  /** 最近一条尚未撤销的记录 */
  last(): JournalEntry | null {
    const { entries, undone } = this.read();
    for (let i = entries.length - 1; i >= 0; i -= 1)
      if (!undone.has(entries[i].id)) return entries[i];
    return null;
  }

  /** 校验逆操作是否仍可执行（文件在此之后被改过 → 不自动撤销） */
  check(e: JournalEntry): string | null {
    for (const op of e.inverse) {
      if (op.op === 'move' && (!fs.existsSync(op.from) || fs.existsSync(op.to)))
        return `无法移回：${op.from}`;
      if (op.op === 'restore' && (!fs.existsSync(op.stored) || fs.existsSync(op.original)))
        return `无法恢复：${op.original}`;
      if (op.op === 'trash' && !fs.existsSync(op.path)) return `文件已不存在：${op.path}`;
      if (op.op === 'custom') {
        const h = this.custom.get(op.kind);
        if (!h) return `无法撤销：${op.kind}`;
        const p = h.check(op.payload);
        if (p) return p;
      }
      if (op.op === 'truncate') {
        if (!fs.existsSync(op.path) || fs.statSync(op.path).size !== op.expectSize)
          return `文件在此之后被修改过：${op.path}`;
      }
    }
    return null;
  }

  async undo(e: JournalEntry): Promise<void> {
    const problem = this.check(e);
    if (problem) throw Object.assign(new Error(problem), { code: 'conflict' });
    for (const op of e.inverse) {
      if (op.op === 'move') await moveNoOverwrite(op.from, op.to);
      else if (op.op === 'restore') await this.trash.restore(op);
      else if (op.op === 'trash') await this.trash.trash(op.path);
      else if (op.op === 'truncate') await fs.promises.truncate(op.path, op.size);
      else if (op.op === 'custom') await this.custom.get(op.kind)!.apply(op.payload);
    }
    fs.appendFileSync(
      this.file,
      `${JSON.stringify({ undoOf: e.id, ts: this.now() } satisfies UndoMark)}\n`,
    );
  }
}
