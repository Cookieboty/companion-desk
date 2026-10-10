import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const MODEL_SCHEME = 'cdmodel';

const MIME: Record<string, string> = {
  '.vrm': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/** 允许经 cdmodel:// 读取的子目录 */
const AREAS = new Set(['remote', 'user', 'cache']);

/**
 * cdmodel://<area>/<rel> → userData/models/<area>/<rel>。
 * 只放行 remote / user / cache 下的 .vrm / 图片；拒绝 `..`、绝对路径和符号链接逃逸。
 */
export async function resolveModelUrl(root: string, rawUrl: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== `${MODEL_SCHEME}:` || !AREAS.has(u.hostname)) return null;
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (!rel || rel.includes('\0') || rel.split(/[\\/]/).some((seg) => seg === '..' || seg === ''))
    return null;
  if (!MIME[path.extname(rel).toLowerCase()]) return null;
  const base = path.resolve(root, u.hostname);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) return null;
  try {
    const real = await fsp.realpath(file);
    const realBase = await fsp.realpath(base);
    if (!real.startsWith(realBase + path.sep)) return null;
    return real;
  } catch {
    return null;
  }
}

export function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}
