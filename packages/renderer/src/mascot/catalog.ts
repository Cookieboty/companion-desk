/**
 * 内置看板娘模型目录。每个条目都必须带开源许可信息（CI 的 assets 许可检查会校验 model-list.json）。
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

export function loadCatalog(fetchImpl: typeof fetch = fetch): Promise<MascotModel[]> {
  if (!cache) {
    cache = fetchImpl(MODEL_LIST_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then(parseCatalog)
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
