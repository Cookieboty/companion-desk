/**
 * 知识库索引（纯逻辑 + JSON 持久化）：文档 → 分块 → BM25（启动时由分块重建）+ 可选向量。
 * 检索：BM25 与向量两路 RRF 融合；同一文档最多取 maxPerDoc 块，保证引用多样。
 */
import * as fs from 'fs';
import * as path from 'path';

import { Bm25Index } from './bm25';
import { b64ToVec, cosine, rrf } from './vector';

export interface ChunkRec {
  id: string;
  text: string;
  page?: number;
  offset: number;
  /** base64 Float32 向量 */
  vec?: string;
}

export interface DocRec {
  id: string;
  sourceId: string;
  /** 文件绝对路径，或 note:<id> */
  path: string;
  title: string;
  ext: string;
  mtime: number;
  size: number;
  indexedAt: number;
  status: 'ok' | 'error' | 'empty';
  error?: string;
  ocr?: boolean;
  /** 生成向量的模型（空 = 没有向量） */
  embedModel?: string;
  chunks: ChunkRec[];
}

export interface Hit {
  chunkId: string;
  docId: string;
  path: string;
  title: string;
  page?: number;
  text: string;
  score: number;
}

interface IndexFile {
  v: 1;
  docs: DocRec[];
}

export class KnowledgeIndex {
  private docs = new Map<string, DocRec>();
  private readonly chunkDoc = new Map<string, string>();
  private readonly chunkById = new Map<string, ChunkRec>();
  private vecCache = new Map<string, Float32Array>();
  private bm25 = new Bm25Index();
  private dirty = false;

  constructor(private readonly file: string | null) {
    if (file) this.load();
  }

  private load(): void {
    try {
      const j = JSON.parse(fs.readFileSync(this.file!, 'utf8')) as IndexFile;
      if (j.v !== 1 || !Array.isArray(j.docs)) return;
      for (const d of j.docs)
        if (d && typeof d.id === 'string' && Array.isArray(d.chunks)) this.put(d);
      this.dirty = false;
    } catch {
      /* 没有索引 / 损坏 → 从空开始，下次重建 */
    }
  }

  save(): void {
    if (!this.file || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ v: 1, docs: [...this.docs.values()] } satisfies IndexFile),
      {
        mode: 0o600,
      },
    );
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }

  get(id: string): DocRec | undefined {
    return this.docs.get(id);
  }

  list(): DocRec[] {
    return [...this.docs.values()];
  }

  bySource(sourceId: string): DocRec[] {
    return this.list().filter((d) => d.sourceId === sourceId);
  }

  put(d: DocRec): void {
    this.remove(d.id);
    this.docs.set(d.id, d);
    for (const c of d.chunks) {
      this.chunkDoc.set(c.id, d.id);
      this.chunkById.set(c.id, c);
      this.bm25.add(c.id, `${d.title}\n${c.text}`);
    }
    this.dirty = true;
  }

  remove(id: string): void {
    const d = this.docs.get(id);
    if (!d) return;
    for (const c of d.chunks) {
      this.chunkDoc.delete(c.id);
      this.chunkById.delete(c.id);
      this.vecCache.delete(c.id);
      this.bm25.remove(c.id);
    }
    this.docs.delete(id);
    this.dirty = true;
  }

  removeSource(sourceId: string): number {
    const ids = this.bySource(sourceId).map((d) => d.id);
    ids.forEach((id) => this.remove(id));
    return ids.length;
  }

  clear(): void {
    this.docs.clear();
    this.chunkDoc.clear();
    this.chunkById.clear();
    this.vecCache.clear();
    this.bm25 = new Bm25Index();
    this.dirty = true;
  }

  stats(): { docs: number; chunks: number; vectors: number; errors: number } {
    let chunks = 0;
    let vectors = 0;
    let errors = 0;
    for (const d of this.docs.values()) {
      chunks += d.chunks.length;
      vectors += d.chunks.filter((c) => c.vec).length;
      if (d.status === 'error') errors++;
    }
    return { docs: this.docs.size, chunks, vectors, errors };
  }

  private vec(c: ChunkRec): Float32Array | null {
    if (!c.vec) return null;
    let v = this.vecCache.get(c.id);
    if (!v) {
      v = b64ToVec(c.vec);
      this.vecCache.set(c.id, v);
    }
    return v;
  }

  search(
    query: string,
    opts: {
      limit?: number;
      queryVec?: Float32Array | null;
      embedModel?: string;
      sourceIds?: string[];
      maxPerDoc?: number;
    } = {},
  ): Hit[] {
    const limit = opts.limit ?? 8;
    const allow = opts.sourceIds ? new Set(opts.sourceIds) : null;
    const ok = (chunkId: string) => {
      if (!allow) return true;
      const d = this.docs.get(this.chunkDoc.get(chunkId) ?? '');
      return !!d && allow.has(d.sourceId);
    };
    const lists: Array<Array<{ id: string }>> = [this.bm25.search(query, 60, ok)];
    if (opts.queryVec) {
      const scored: Array<{ id: string; score: number }> = [];
      for (const d of this.docs.values()) {
        if (allow && !allow.has(d.sourceId)) continue;
        if (opts.embedModel && d.embedModel !== opts.embedModel) continue;
        for (const c of d.chunks) {
          const v = this.vec(c);
          if (v) scored.push({ id: c.id, score: cosine(opts.queryVec, v) });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      lists.push(scored.slice(0, 60).filter((s) => s.score > 0.2));
    }
    const fused =
      lists.length > 1 ? rrf(lists) : (lists[0] as Array<{ id: string; score: number }>);
    const perDoc = new Map<string, number>();
    const out: Hit[] = [];
    for (const f of fused) {
      const docId = this.chunkDoc.get(f.id);
      const d = docId ? this.docs.get(docId) : undefined;
      const c = this.chunkById.get(f.id);
      if (!d || !c) continue;
      const n = perDoc.get(d.id) ?? 0;
      if (n >= (opts.maxPerDoc ?? 2)) continue;
      perDoc.set(d.id, n + 1);
      out.push({
        chunkId: c.id,
        docId: d.id,
        path: d.path,
        title: d.title,
        page: c.page,
        text: c.text,
        score: f.score,
      });
      if (out.length >= limit) break;
    }
    return out;
  }
}
