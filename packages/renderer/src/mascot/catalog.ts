import type {
  LicenseTermsView,
  ModelConfig,
  ModelOrigin,
  RegistryModel,
  VrmMetaSummary,
} from '@ig-live/types';

/**
 * 看板娘模型（统一注册表：内置 + 商店已安装 + 用户导入）。
 * Electron 下由主进程 `models:list` 提供；纯浏览器 / 测试回落到内置 model-list.json。
 */
export interface MascotModel {
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
  origin?: ModelOrigin;
  credit?: string;
  licenseTerms?: LicenseTermsView;
  version?: string;
  config?: ModelConfig;
  meta?: VrmMetaSummary;
}

export function fromRegistry(m: RegistryModel): MascotModel {
  return {
    name: m.id,
    displayName: m.name,
    description: m.description,
    path: m.path,
    thumbnail: m.thumbnail,
    author: m.author,
    license: m.license,
    source: m.source ?? '',
    vrmVersion: m.vrmVersion,
    tags: m.tags,
    origin: m.origin,
    credit: m.credit,
    licenseTerms: m.licenseTerms,
    version: m.version,
    config: m.config,
    meta: m.meta,
  };
}

export interface MascotCatalog {
  models: MascotModel[];
}

export const MODEL_LIST_URL = './assets/models/vrm/model-list.json';
const STORAGE_KEY = 'companion.mascot.model';

export function parseCatalog(raw: unknown): MascotModel[] {
  const models = (raw as Partial<MascotCatalog> | null)?.models;
  if (!Array.isArray(models)) return [];
  return models.filter(
    (m): m is MascotModel =>
      !!m &&
      typeof m.name === 'string' &&
      typeof m.path === 'string' &&
      typeof m.license === 'string' &&
      m.license.length > 0,
  );
}

let cache: Promise<MascotModel[]> | null = null;

export function loadCatalog(
  fetchImpl: typeof fetch = fetch,
  force = false,
): Promise<MascotModel[]> {
  if (force) cache = null;
  const api = typeof window !== 'undefined' ? window.electronAPI?.models : undefined;
  if (!cache && api) {
    cache = api
      .list()
      .then((list) => list.map(fromRegistry))
      .catch(() => {
        cache = null;
        return [];
      });
  }
  if (!cache) {
    cache = fetchImpl(MODEL_LIST_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => parseCatalog(raw).map((m) => ({ ...m, origin: 'bundled' as const })))
      .catch(() => {
        cache = null;
        return [];
      });
  }
  return cache;
}

export function readSelectedModel(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeSelectedModel(name: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, name);
  } catch {
    /* storage unavailable */
  }
}

/** 选中模型；找不到时回落到第一个（默认角色）。 */
export function pickModel(models: MascotModel[], name: string | null): MascotModel | undefined {
  return models.find((m) => m.name === name) ?? models[0];
}

export function nextModel(models: MascotModel[], current: string | null): MascotModel | undefined {
  if (models.length === 0) return undefined;
  const i = models.findIndex((m) => m.name === current);
  return models[(i + 1) % models.length];
}
