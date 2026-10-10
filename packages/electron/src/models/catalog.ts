import { isAllowedLicense } from './licenses';

/** 远程模型目录（companion-desk-models/catalog.json，schemaVersion 1） */
export interface CatalogFile {
  urls: string[];
  sha256: string;
  size: number;
}

export interface CatalogEntry {
  id: string;
  name: string;
  description?: string;
  author: string;
  license: string;
  source: string;
  version: string;
  vrmVersion: string;
  tags: string[];
  credit: string;
  vrm: CatalogFile;
  thumbnail: CatalogFile;
}

export interface ModelCatalog {
  schemaVersion: 1;
  models: CatalogEntry[];
}

export const DEFAULT_CATALOG_URLS = [
  'https://raw.githubusercontent.com/Cookieboty/companion-desk-models/main/catalog.json',
  'https://cdn.jsdelivr.net/gh/Cookieboty/companion-desk-models@main/catalog.json',
];

export const MAX_REMOTE_VRM_BYTES = 200 * 1024 * 1024;
export const MAX_THUMB_BYTES = 1024 * 1024;
const ID_RE = /^[a-z0-9-]{2,64}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

export interface UrlPolicy {
  /** 测试用：允许 http://127.0.0.1 / localhost（仅回环地址） */
  allowLoopbackHttp?: boolean;
}

export function isAllowedUrl(raw: unknown, policy: UrlPolicy = {}): raw is string {
  if (typeof raw !== 'string') return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  return (
    !!policy.allowLoopbackHttp &&
    u.protocol === 'http:' &&
    (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
  );
}

function file(raw: unknown, max: number, policy: UrlPolicy): CatalogFile | null {
  const f = raw as Partial<CatalogFile> | null;
  if (!f || !Array.isArray(f.urls)) return null;
  const urls = f.urls.filter((u) => isAllowedUrl(u, policy));
  if (!urls.length) return null;
  if (typeof f.sha256 !== 'string' || !SHA_RE.test(f.sha256.toLowerCase())) return null;
  if (typeof f.size !== 'number' || !Number.isInteger(f.size) || f.size <= 0 || f.size > max)
    return null;
  return { urls, sha256: f.sha256.toLowerCase(), size: f.size };
}

const s = (v: unknown, max = 500): string | undefined =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined;

export interface CatalogValidation {
  catalog: ModelCatalog;
  rejected: Array<{ id: string; reason: string }>;
}

/** 校验目录：未知 schema 抛错；单个条目不合规则丢弃并记录原因（许可、https、sha256、大小…）。 */
export function validateCatalog(raw: unknown, policy: UrlPolicy = {}): CatalogValidation {
  const c = raw as { schemaVersion?: unknown; models?: unknown } | null;
  if (!c || c.schemaVersion !== 1 || !Array.isArray(c.models))
    throw new Error('不支持的模型目录格式');
  const rejected: CatalogValidation['rejected'] = [];
  const models: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const item of c.models as Array<Record<string, unknown>>) {
    const id = s(item?.id, 64) ?? '?';
    const reject = (reason: string) => rejected.push({ id, reason });
    if (!ID_RE.test(id)) {
      reject('invalid id');
      continue;
    }
    if (seen.has(id)) {
      reject('duplicate id');
      continue;
    }
    if (!isAllowedLicense(item.license)) {
      reject(`licence not allowed: ${String(item.license)}`);
      continue;
    }
    const vrm = file(item.vrm, MAX_REMOTE_VRM_BYTES, policy);
    if (!vrm) {
      reject('vrm: https url + sha256 + size (<= 200MB) required');
      continue;
    }
    const thumbnail = file(item.thumbnail, MAX_THUMB_BYTES, policy);
    if (!thumbnail) {
      reject('thumbnail: https url + sha256 + size (<= 1MB) required');
      continue;
    }
    const name = s(item.name, 120);
    const author = s(item.author, 200);
    const credit = s(item.credit, 1000);
    const version = s(item.version, 32);
    const source = isAllowedUrl(item.source) ? (item.source as string) : undefined;
    if (!name || !author || !credit || !version || !/^\d+\.\d+\.\d+$/.test(version) || !source) {
      reject('missing name/author/credit/version/source');
      continue;
    }
    seen.add(id);
    models.push({
      id,
      name,
      description: s(item.description, 500),
      author,
      license: item.license as string,
      source,
      version,
      vrmVersion: item.vrmVersion === '1.0' ? '1.0' : '0.x',
      tags: Array.isArray(item.tags)
        ? item.tags.filter((t): t is string => typeof t === 'string').slice(0, 16)
        : [],
      credit,
      vrm,
      thumbnail,
    });
  }
  return { catalog: { schemaVersion: 1, models }, rejected };
}

/** 语义化版本比较：a > b 返回正数 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
