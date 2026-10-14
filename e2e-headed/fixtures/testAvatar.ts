/**
 * e2e 用的 3D 测试模型（VRoid AvatarSample_D，pixiv Inc.，CC0-1.0）。
 *
 * 不再提交到 git（16.9 MB）：首次运行时从 OpenGameArt 下载 zip，校验 sha256 后解出 .vrm，
 * 缓存到 `e2e-headed/.cache/`（已 gitignore；CI 用 actions/cache 复用）。
 * 离线环境可预先把文件放到缓存路径，或用 CD_SEED_USER_VRM 指向本地已有文件。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { unzipSync } from 'fflate';

export const TEST_AVATAR = {
  url: 'https://opengameart.org/sites/default/files/avatarsample_d_0.zip',
  entry: 'AvatarSample_D.vrm',
  sha256: '9adf1b44e959d2688d62c2dd558e74315d6aa40e3bf8d281390b7a85dc0df9b7',
  size: 16_851_352,
} as const;

export const TEST_AVATAR_CACHE = resolve(
  process.env.NOMI_E2E_CACHE_DIR ?? resolve(process.cwd(), 'e2e-headed', '.cache'),
  'test-avatar-cc0.vrm',
);

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

function isValid(file: string): boolean {
  if (!existsSync(file)) return false;
  return sha256(readFileSync(file)) === TEST_AVATAR.sha256;
}

/** 确保缓存里有校验通过的测试模型，返回其路径。 */
export async function ensureTestAvatar(file = TEST_AVATAR_CACHE): Promise<string> {
  if (isValid(file)) return file;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(TEST_AVATAR.url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const zip = new Uint8Array(await res.arrayBuffer());
      const vrm = unzipSync(zip, { filter: (f) => f.name === TEST_AVATAR.entry })[
        TEST_AVATAR.entry
      ];
      if (!vrm) throw new Error(`${TEST_AVATAR.entry} not found in archive`);
      const got = sha256(vrm);
      if (got !== TEST_AVATAR.sha256) throw new Error(`sha256 mismatch: ${got}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, vrm);
      renameSync(`${file}.tmp`, file);
      return file;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(
    `下载 e2e 测试模型失败（${TEST_AVATAR.url}）：${String(lastErr)}。` +
      `可手动下载并解压 ${TEST_AVATAR.entry} 到 ${file}`,
  );
}
