import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { RegistryModel } from '@ig-live/types';

import { isAllowedLicense } from './licenses';
import type { ModelStore } from './ModelStore';
import type { UserModels } from './UserModels';

interface BundledListEntry {
  name: string;
  displayName: string;
  description?: string;
  path: string;
  thumbnail?: string;
  author: string;
  license: string;
  source: string;
  vrmVersion?: string;
  tags?: string[];
}

export interface ModelRegistryOptions {
  /** 渲染进程资源目录下的 assets/models/vrm/model-list.json（内置模型） */
  bundledListPath: string;
  store: ModelStore;
  user: UserModels;
}

/**
 * 统一模型注册表：内置 + 远程已安装 + 用户导入。
 * 角色选择器、托盘、AI 工具都只读这里。同 id 的远程安装覆盖内置（用于更新内置模型）。
 */
export class ModelRegistry {
  constructor(private readonly opts: ModelRegistryOptions) {}

  async bundled(): Promise<RegistryModel[]> {
    try {
      const raw = JSON.parse(await fsp.readFile(this.opts.bundledListPath, 'utf8')) as {
        models?: BundledListEntry[];
      };
      return (raw.models ?? [])
        .filter(
          (m) =>
            m &&
            typeof m.name === 'string' &&
            typeof m.path === 'string' &&
            isAllowedLicense(m.license),
        )
        .map((m) => ({
          id: m.name,
          name: m.displayName ?? m.name,
          description: m.description,
          origin: 'bundled' as const,
          path: m.path,
          thumbnail: m.thumbnail,
          author: m.author,
          license: m.license,
          source: m.source,
          credit: `${m.displayName ?? m.name} — ${m.author} (${m.license})`,
          vrmVersion: m.vrmVersion,
          tags: m.tags,
        }));
    } catch {
      return [];
    }
  }

  async list(): Promise<RegistryModel[]> {
    const [bundled, installed, user] = await Promise.all([
      this.bundled(),
      this.opts.store.listInstalled(),
      this.opts.user.list(),
    ]);
    const byId = new Map<string, RegistryModel>();
    for (const m of bundled) byId.set(m.id, m);
    for (const r of installed) {
      const e = r.entry;
      if (!isAllowedLicense(e.license)) continue;
      const thumb = (await exists(path.join(this.opts.store.remoteDir, r.id, 'thumb.png')))
        ? 'thumb.png'
        : 'thumb.jpg';
      byId.set(r.id, {
        id: r.id,
        name: e.name,
        description: e.description,
        origin: 'remote',
        path: `cdmodel://remote/${r.id}/model.vrm?v=${r.sha256.slice(0, 12)}`,
        thumbnail: `cdmodel://remote/${r.id}/${thumb}`,
        author: e.author,
        license: e.license,
        source: e.source,
        credit: e.credit,
        version: r.version,
        vrmVersion: e.vrmVersion,
        tags: e.tags,
      });
    }
    for (const u of user) {
      byId.set(u.id, {
        id: u.id,
        name: u.name,
        origin: 'user',
        path: `cdmodel://user/${u.id}/model.vrm?v=${u.updatedAt}`,
        thumbnail: u.thumbnail
          ? `cdmodel://user/${u.id}/${u.thumbnail}?v=${u.updatedAt}`
          : undefined,
        author: u.meta.author ?? '（未知）',
        license: u.meta.license ?? 'user-provided',
        credit: `用户导入：${u.originalFileName}`,
        vrmVersion: u.meta.version,
        config: u.config,
        meta: u.meta,
      });
    }
    return [...byId.values()];
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}
