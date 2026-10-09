/**
 * 品牌更名（智能小助手 → Companion Desk）后，打包产物的 productName 变化会让
 * Electron 的 userData 目录随之变化（`<appData>/<productName>`）。
 * 首次以新名称启动时，若新目录尚不存在而旧目录存在，则把旧目录**复制**过来
 * （不删除旧目录，便于回滚）。必须在 `app.whenReady()` 之前调用。
 */
import * as fs from 'fs';
import * as path from 'path';

export const LEGACY_PRODUCT_NAMES = ['智能小助手'] as const;

export interface MigrateResult {
  migrated: boolean;
  from?: string;
  to: string;
}

export function migrateLegacyUserData(
  appDataDir: string,
  userDataDir: string,
  legacyNames: readonly string[] = LEGACY_PRODUCT_NAMES,
): MigrateResult {
  if (fs.existsSync(userDataDir)) return { migrated: false, to: userDataDir };
  for (const name of legacyNames) {
    const from = path.join(appDataDir, name);
    if (from === userDataDir || !fs.existsSync(from)) continue;
    fs.cpSync(from, userDataDir, { recursive: true, errorOnExist: false });
    return { migrated: true, from, to: userDataDir };
  }
  return { migrated: false, to: userDataDir };
}
