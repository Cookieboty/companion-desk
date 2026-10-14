import fs from 'fs';

/**
 * 写入含敏感信息的配置文件并强制 0600（仅当前用户可读写）。
 * writeFileSync 的 mode 只在新建时生效，故对已存在文件再 chmod 一次；
 * Windows 不支持 POSIX 权限位，chmod 失败时忽略。
 */
export function writePrivateFile(file: string, data: string): void {
  fs.writeFileSync(file, data, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows 等平台忽略 */
  }
}

/** 原子写：先写 0600 的 .tmp，再 rename；最后收紧目标权限（修正历史遗留文件）。 */
export function writePrivateFileAtomic(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows 等平台忽略 */
  }
}
