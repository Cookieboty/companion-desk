import { promises as fsp } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_CATALOG_URLS,
  compareVersions,
  isAllowedUrl,
  validateCatalog,
  type CatalogEntry,
  type ModelCatalog,
  type UrlPolicy,
} from './catalog';
import { downloadVerified, sha256File, type DownloadProgress } from './download';
import { inspectVrmFile } from './vrmInspect';

export interface InstalledRemote {
  id: string;
  version: string;
  sha256: string;
  installedAt: number;
  entry: CatalogEntry;
}

export interface StoreEntry extends CatalogEntry {
  installedVersion?: string;
  updateAvailable: boolean;
  /** cdmodel://cache/... 本地缓存的缩略图（下载并校验后） */
  thumbnailUrl?: string;
}

export interface StoreState {
  entries: StoreEntry[];
  /** 当前目录来自缓存（网络不可用） */
  offline: boolean;
  fetchedAt?: number;
  error?: string;
  rejected: Array<{ id: string; reason: string }>;
}

interface CatalogCache {
  url: string;
  etag?: string;
  fetchedAt: number;
  body: unknown;
}

export interface ModelStoreOptions {
  root: string; // userData/models
  catalogUrls?: string[];
  fetchImpl?: typeof fetch;
  policy?: UrlPolicy;
  logger?: { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void };
}

/** 远程模型商店：目录（ETag 缓存）+ 下载（续传 / 重试 / sha256）+ 安装记录。 */
export class ModelStore {
  private catalog: ModelCatalog | null = null;
  private readonly inflight = new Map<string, AbortController>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ModelStoreOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get remoteDir(): string {
    return path.join(this.opts.root, 'remote');
  }

  private get cacheDir(): string {
    return path.join(this.opts.root, 'cache');
  }

  catalogUrls(): string[] {
    return (this.opts.catalogUrls?.length ? this.opts.catalogUrls : DEFAULT_CATALOG_URLS).filter(
      (u) => isAllowedUrl(u, this.opts.policy),
    );
  }

  async listInstalled(): Promise<InstalledRemote[]> {
    const out: InstalledRemote[] = [];
    let ids: string[];
    try {
      ids = await fsp.readdir(this.remoteDir);
    } catch {
      return out;
    }
    for (const id of ids) {
      try {
        const rec = JSON.parse(
          await fsp.readFile(path.join(this.remoteDir, id, 'installed.json'), 'utf8'),
        ) as InstalledRemote;
        await fsp.access(path.join(this.remoteDir, id, 'model.vrm'));
        if (rec.id === id) out.push(rec);
      } catch {
        /* 不完整的安装：忽略 */
      }
    }
    return out;
  }

  async getState(refresh = false): Promise<StoreState> {
    let offline = false;
    let error: string | undefined;
    let rejected: StoreState['rejected'] = [];
    let fetchedAt: number | undefined;
    const cachePath = path.join(this.cacheDir, 'catalog.json');
    let cache: CatalogCache | null;
    try {
      cache = JSON.parse(await fsp.readFile(cachePath, 'utf8')) as CatalogCache;
    } catch {
      cache = null;
    }

    if (refresh || !this.catalog) {
      let fresh: { body: unknown; url: string; etag?: string } | null = null;
      for (const url of this.catalogUrls()) {
        try {
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (cache?.etag && cache.url === url) headers['If-None-Match'] = cache.etag;
          const res = await this.fetchImpl(url, {
            headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
          });
          if (res.status === 304 && cache) {
            fresh = { body: cache.body, url, etag: cache.etag };
            break;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (text.length > 2 * 1024 * 1024) throw new Error('目录过大');
          fresh = { body: JSON.parse(text), url, etag: res.headers.get('etag') ?? undefined };
          break;
        } catch (err) {
          error = `${url}: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      const source =
        fresh ?? (cache ? { body: cache.body, url: cache.url, etag: cache.etag } : null);
      offline = !fresh;
      if (source) {
        try {
          const v = validateCatalog(source.body, this.opts.policy);
          this.catalog = v.catalog;
          rejected = v.rejected;
          if (fresh) {
            fetchedAt = Date.now();
            await fsp.mkdir(this.cacheDir, { recursive: true });
            await fsp.writeFile(
              cachePath,
              JSON.stringify({ ...fresh, fetchedAt } satisfies CatalogCache),
            );
          } else {
            fetchedAt = cache?.fetchedAt;
          }
          if (fresh) error = undefined;
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
      }
      if (rejected.length) this.opts.logger?.warn('模型目录中有条目被拒绝', rejected);
    } else {
      fetchedAt = cache?.fetchedAt;
    }

    const installed = new Map((await this.listInstalled()).map((i) => [i.id, i]));
    const entries: StoreEntry[] = [];
    for (const e of this.catalog?.models ?? []) {
      const inst = installed.get(e.id);
      entries.push({
        ...e,
        installedVersion: inst?.version,
        updateAvailable: !!inst && compareVersions(e.version, inst.version) > 0,
        thumbnailUrl: await this.cachedThumb(e, !offline),
      });
    }
    return { entries, offline, fetchedAt, error, rejected };
  }

  /** 缩略图下载到 cache/thumbs（sha256 校验），返回 cdmodel:// 地址 */
  private async cachedThumb(e: CatalogEntry, allowNetwork: boolean): Promise<string | undefined> {
    const ext = e.thumbnail.urls[0]?.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const name = `${e.id}-${e.thumbnail.sha256.slice(0, 12)}.${ext}`;
    const dest = path.join(this.cacheDir, 'thumbs', name);
    try {
      await fsp.access(dest);
      return `cdmodel://cache/thumbs/${name}`;
    } catch {
      if (!allowNetwork) return undefined;
    }
    try {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await downloadVerified(e.thumbnail, dest, {
        fetchImpl: this.fetchImpl,
        policy: this.opts.policy,
        attemptsPerUrl: 1,
      });
      return `cdmodel://cache/thumbs/${name}`;
    } catch {
      return undefined;
    }
  }

  isDownloading(id: string): boolean {
    return this.inflight.has(id);
  }

  cancel(id: string): void {
    this.inflight.get(id)?.abort();
  }

  /** 安装 / 更新：下载到 remote/<id>/model.vrm（续传 + 校验），校验是 VRM 后写 installed.json */
  async install(id: string, onProgress?: (p: DownloadProgress) => void): Promise<InstalledRemote> {
    if (!this.catalog) await this.getState(false);
    const entry = this.catalog?.models.find((m) => m.id === id);
    if (!entry) throw new Error(`目录中没有模型 ${id}`);
    if (this.inflight.has(id)) throw new Error('正在下载中');
    const ac = new AbortController();
    this.inflight.set(id, ac);
    const dir = path.join(this.remoteDir, id);
    const staging = path.join(dir, `download-${entry.vrm.sha256.slice(0, 12)}.vrm`);
    try {
      await fsp.mkdir(dir, { recursive: true });
      await downloadVerified(entry.vrm, staging, {
        fetchImpl: this.fetchImpl,
        policy: this.opts.policy,
        signal: ac.signal,
        onProgress,
      });
      // 只读解析一遍，确认确实是 VRM（不执行任何内容）
      await inspectVrmFile(staging);
      await fsp.rename(staging, path.join(dir, 'model.vrm'));
      const ext = entry.thumbnail.urls[0]?.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      await downloadVerified(entry.thumbnail, path.join(dir, `thumb.${ext}`), {
        fetchImpl: this.fetchImpl,
        policy: this.opts.policy,
        attemptsPerUrl: 1,
      }).catch(() => undefined);
      const rec: InstalledRemote = {
        id,
        version: entry.version,
        sha256: entry.vrm.sha256,
        installedAt: Date.now(),
        entry,
      };
      await fsp.writeFile(path.join(dir, 'installed.json'), JSON.stringify(rec, null, 2));
      this.opts.logger?.info('远程模型已安装', { id, version: entry.version });
      return rec;
    } catch (err) {
      if (ac.signal.aborted)
        await fsp.rm(`${staging}.part`, { force: true }).catch(() => undefined);
      throw err;
    } finally {
      this.inflight.delete(id);
    }
  }

  async remove(id: string): Promise<void> {
    if (!/^[a-z0-9-]{2,64}$/.test(id)) throw new Error('invalid id');
    this.cancel(id);
    await fsp.rm(path.join(this.remoteDir, id), { recursive: true, force: true });
  }

  /** 已安装文件完整性复查（供调试 / 测试） */
  async verifyInstalled(id: string): Promise<boolean> {
    const rec = (await this.listInstalled()).find((r) => r.id === id);
    if (!rec) return false;
    return (await sha256File(path.join(this.remoteDir, id, 'model.vrm'))) === rec.sha256;
  }
}
