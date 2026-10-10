import { createHash } from 'node:crypto';
import { createReadStream, promises as fsp } from 'node:fs';

import { isAllowedUrl, type CatalogFile, type UrlPolicy } from './catalog';

export interface DownloadProgress {
  received: number;
  total: number;
}

export interface DownloadOptions {
  fetchImpl?: typeof fetch;
  policy?: UrlPolicy;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  /** 每个 URL 的尝试次数（默认 2），失败后换下一个 URL */
  attemptsPerUrl?: number;
}

export class DownloadError extends Error {}

export async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await fsp.stat(path)).size;
  } catch {
    return 0;
  }
}

/**
 * 下载到 dest：先写 dest.part（支持 Range 续传），完成后校验大小 + sha256 再原子改名。
 * 仅允许 https（测试可放行回环 http）；超过声明大小立即中止；任何校验失败都删除临时文件。
 */
export async function downloadVerified(
  file: CatalogFile,
  dest: string,
  opts: DownloadOptions = {},
): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch;
  const part = `${dest}.part`;
  const attempts = opts.attemptsPerUrl ?? 2;
  let lastError: unknown = null;

  for (const url of file.urls) {
    if (!isAllowedUrl(url, opts.policy)) continue;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (opts.signal?.aborted) throw new DownloadError('已取消');
      try {
        let have = await sizeOf(part);
        if (have > file.size) {
          await fsp.rm(part, { force: true });
          have = 0;
        }
        if (have < file.size) {
          const res = await doFetch(url, {
            headers: have > 0 ? { Range: `bytes=${have}-` } : {},
            redirect: 'follow',
            signal: opts.signal,
          });
          // 重定向后仍需 https
          if (res.url && !isAllowedUrl(res.url, opts.policy))
            throw new DownloadError(`重定向到不安全地址: ${res.url}`);
          if (res.status === 200 && have > 0) {
            have = 0; // 服务端不支持 Range：从头开始
            await fsp.rm(part, { force: true });
          } else if (res.status !== 200 && res.status !== 206) {
            throw new DownloadError(`HTTP ${res.status}`);
          }
          if (!res.body) throw new DownloadError('空响应');
          const fh = await fsp.open(part, have > 0 ? 'a' : 'w');
          try {
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              have += value.byteLength;
              if (have > file.size) {
                await reader.cancel();
                throw new DownloadError('文件大小超过目录声明，已中止');
              }
              await fh.write(value);
              opts.onProgress?.({ received: have, total: file.size });
            }
          } finally {
            await fh.close();
          }
        }
        if ((await sizeOf(part)) !== file.size) throw new DownloadError('文件不完整');
        const digest = await sha256File(part);
        if (digest !== file.sha256) {
          await fsp.rm(part, { force: true });
          throw new DownloadError('sha256 校验失败，已丢弃文件');
        }
        await fsp.rename(part, dest);
        return;
      } catch (err) {
        lastError = err;
        if (opts.signal?.aborted) {
          throw new DownloadError('已取消');
        }
      }
    }
  }
  throw lastError instanceof Error ? lastError : new DownloadError('没有可用的下载地址');
}
