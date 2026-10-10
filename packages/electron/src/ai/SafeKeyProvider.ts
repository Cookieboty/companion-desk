/**
 * SafeKeyProvider - 使用 Electron `safeStorage` 实现 KeyStoreService
 *
 * 密钥（token / api key）通过 `safeStorage.encryptString` 加密后写入 userData 下
 * 独立的 keys 目录；读取时惰性解密。加密密钥由操作系统 keychain 保管，因此本类
 * 只做序列化 + IO，不需要额外的口令。
 */

import { app, safeStorage } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

import type { KeyStoreService } from '@ig-live/bundle-ig-electron-caps';

export interface SafeKeyProviderOptions {
  /** 密钥文件根目录，默认 `<userData>/keys` */
  baseDir?: string;
  /** 未准备好的加密后端（linux 无 keyring）时的降级策略 */
  fallback?: 'reject' | 'plaintext';
}

export class SafeKeyProvider implements KeyStoreService {
  private readonly baseDir: string;
  private readonly fallback: 'reject' | 'plaintext';

  constructor(opts: SafeKeyProviderOptions = {}) {
    this.baseDir = opts.baseDir ?? path.join(app.getPath('userData'), 'keys');
    this.fallback = opts.fallback ?? 'reject';
  }

  private filePath(id: string): string {
    const safe = id.replace(/[^A-Za-z0-9_.-]/g, '_');
    return path.join(this.baseDir, `${safe}.bin`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async get(id: string): Promise<string | undefined> {
    try {
      const buf = await fs.readFile(this.filePath(id));
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf);
      }
      if (this.fallback === 'plaintext') return buf.toString('utf8');
      return undefined;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }

  async set(id: string, value: string): Promise<void> {
    await this.ensureDir();
    let buf: Buffer;
    if (safeStorage.isEncryptionAvailable()) {
      buf = safeStorage.encryptString(value);
    } else if (this.fallback === 'plaintext') {
      buf = Buffer.from(value, 'utf8');
    } else {
      throw new Error('[SafeKeyProvider] safeStorage 不可用；请配置 fallback=plaintext');
    }
    await fs.writeFile(this.filePath(id), buf, { mode: 0o600 });
  }

  async del(id: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(id));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      return files
        .filter((f) => f.endsWith('.bin'))
        .map((f) => f.slice(0, -'.bin'.length));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
}
