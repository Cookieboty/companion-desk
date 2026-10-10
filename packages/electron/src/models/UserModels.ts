import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { ModelConfig, VrmMetaSummary } from '@ig-live/types';

import { sanitizeModelConfig } from './modelConfig';
import { inspectVrmFile, type VrmInspection } from './vrmInspect';

export const MAX_USER_VRM_BYTES = 300 * 1024 * 1024;

export interface UserModelRecord {
  id: string;
  name: string;
  originalFileName: string;
  importedAt: number;
  updatedAt: number;
  meta: VrmMetaSummary;
  config: ModelConfig;
  thumbnail?: string; // 文件名
}

const ID_RE = /^user-[a-z0-9-]{1,48}-[0-9a-f]{6}$/;

function summarize(i: VrmInspection): VrmMetaSummary {
  const m = i.meta;
  return {
    version: m.version,
    title: m.title?.slice(0, 120),
    author: m.author?.slice(0, 200),
    license: m.license?.slice(0, 300),
    allowedUser: m.allowedUser?.slice(0, 60),
    commercialUsage: m.commercialUsage?.slice(0, 60),
    allowRedistribution: m.allowRedistribution,
    expressions: m.expressions.slice(0, 64),
  };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/\.vrm$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'model'
  );
}

/**
 * 用户导入的模型：保存在 userData/models/user/<id>/，从不上传、不随应用分发。
 * 只做静态校验（GLB 头 + VRM 扩展 + meta），不会执行文件中的任何内容。
 */
export class UserModels {
  constructor(private readonly root: string) {}

  get dir(): string {
    return path.join(this.root, 'user');
  }

  private recordPath(id: string): string {
    if (!ID_RE.test(id)) throw new Error('invalid user model id');
    return path.join(this.dir, id, 'model.json');
  }

  async list(): Promise<UserModelRecord[]> {
    let ids: string[];
    try {
      ids = await fsp.readdir(this.dir);
    } catch {
      return [];
    }
    const out: UserModelRecord[] = [];
    for (const id of ids.filter((i) => ID_RE.test(i))) {
      try {
        const rec = JSON.parse(await fsp.readFile(this.recordPath(id), 'utf8')) as UserModelRecord;
        await fsp.access(path.join(this.dir, id, 'model.vrm'));
        out.push({ ...rec, id, config: sanitizeModelConfig(rec.config) });
      } catch {
        /* 损坏的目录：忽略 */
      }
    }
    return out.sort((a, b) => a.importedAt - b.importedAt);
  }

  async get(id: string): Promise<UserModelRecord> {
    const rec = (await this.list()).find((r) => r.id === id);
    if (!rec) throw new Error('模型不存在');
    return rec;
  }

  private async validate(src: string): Promise<VrmInspection> {
    if (!/\.vrm$/i.test(src)) throw new Error('请选择 .vrm 文件');
    const st = await fsp.stat(src);
    if (!st.isFile()) throw new Error('不是文件');
    if (st.size > MAX_USER_VRM_BYTES) throw new Error('文件超过 300 MB 上限');
    return inspectVrmFile(src, true);
  }

  private async writeThumb(dir: string, i: VrmInspection): Promise<string | undefined> {
    for (const f of ['thumb.png', 'thumb.jpg']) await fsp.rm(path.join(dir, f), { force: true });
    if (!i.thumbnail) return undefined;
    const name = i.thumbnail.mime === 'image/png' ? 'thumb.png' : 'thumb.jpg';
    await fsp.writeFile(path.join(dir, name), i.thumbnail.bytes);
    return name;
  }

  async import(src: string, config: ModelConfig = {}): Promise<UserModelRecord> {
    const inspection = await this.validate(src);
    const meta = summarize(inspection);
    const base = meta.title || path.basename(src);
    const id = `user-${slug(base)}-${randomBytes(3).toString('hex')}`;
    const dir = path.join(this.dir, id);
    await fsp.mkdir(dir, { recursive: true });
    try {
      await fsp.copyFile(src, path.join(dir, 'model.vrm'));
      const thumbnail = await this.writeThumb(dir, inspection);
      const now = Date.now();
      const rec: UserModelRecord = {
        id,
        name: config.name?.trim() || meta.title || path.basename(src, path.extname(src)),
        originalFileName: path.basename(src),
        importedAt: now,
        updatedAt: now,
        meta,
        config: sanitizeModelConfig(config),
        thumbnail,
      };
      await fsp.writeFile(this.recordPath(id), JSON.stringify(rec, null, 2));
      return rec;
    } catch (err) {
      await fsp.rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  async replace(id: string, src: string): Promise<UserModelRecord> {
    const rec = await this.get(id);
    const inspection = await this.validate(src);
    const dir = path.join(this.dir, id);
    const tmp = path.join(dir, 'model.vrm.new');
    await fsp.copyFile(src, tmp);
    await fsp.rename(tmp, path.join(dir, 'model.vrm'));
    const next: UserModelRecord = {
      ...rec,
      originalFileName: path.basename(src),
      updatedAt: Date.now(),
      meta: summarize(inspection),
      thumbnail: await this.writeThumb(dir, inspection),
    };
    await fsp.writeFile(this.recordPath(id), JSON.stringify(next, null, 2));
    return next;
  }

  async updateConfig(id: string, config: ModelConfig): Promise<UserModelRecord> {
    const rec = await this.get(id);
    const clean = sanitizeModelConfig(config);
    const next = { ...rec, config: clean, name: clean.name || rec.name, updatedAt: Date.now() };
    await fsp.writeFile(this.recordPath(id), JSON.stringify(next, null, 2));
    return next;
  }

  async remove(id: string): Promise<void> {
    this.recordPath(id); // 校验 id
    await fsp.rm(path.join(this.dir, id), { recursive: true, force: true });
  }
}
