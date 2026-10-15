/**
 * 按需下载：流式写临时文件 → sha256 校验 → 原子改名 / 解包。可取消，带进度回调。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import { unzipSync } from 'fflate';

import { t } from '../i18n';

export interface DownloadProgress {
  received: number;
  total: number;
}

export class ChecksumError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(t('校验失败：期望 {0}…，实际 {1}…', expected.slice(0, 12), actual.slice(0, 12)));
  }
}

export type FetchLike = (url: string, init: { signal?: AbortSignal }) => Promise<Response>;

export class DownloadTimeoutError extends Error {
  constructor(readonly idleMs: number) {
    super(`download stalled: no data for ${Math.round(idleMs / 1000)}s (timeout)`);
    this.name = 'DownloadTimeoutError';
  }
}

export async function downloadVerified(opts: {
  url: string;
  sha256: string;
  dest: string;
  expectedBytes?: number;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  fetchImpl?: FetchLike;
  /**
   * 空闲超时（毫秒）：建立连接 / 收到响应头 / 两个数据块之间超过该时长无数据则中止并抛
   * DownloadTimeoutError。未设置则不限（保持旧调用方行为）。
   */
  idleTimeoutMs?: number;
}): Promise<void> {
  const f = opts.fetchImpl ?? ((u, i) => fetch(u, { ...i, redirect: 'follow' }));
  const ctl = new AbortController();
  const onOuterAbort = () => ctl.abort();
  if (opts.signal?.aborted) ctl.abort();
  else opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let rejectIdle: ((e: Error) => void) | undefined;
  const idle = new Promise<never>((_, j) => {
    rejectIdle = j;
  });
  idle.catch(() => undefined);
  const arm = () => {
    if (!opts.idleTimeoutMs) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      const err = new DownloadTimeoutError(opts.idleTimeoutMs!);
      rejectIdle?.(err);
      ctl.abort();
    }, opts.idleTimeoutMs);
  };
  const cleanupTimer = () => {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  };
  const guard = <T>(p: Promise<T>): Promise<T> =>
    opts.idleTimeoutMs ? Promise.race([p, idle]) : p;

  let out: fs.WriteStream | undefined;
  const tmp = `${opts.dest}.part`;
  try {
    arm();
    const res = await guard(f(opts.url, { signal: ctl.signal }));
    if (!res.ok || !res.body) {
      throw Object.assign(new Error(t('下载失败：HTTP {0}', res.status)), { status: res.status });
    }
    const total = Number(res.headers.get('content-length')) || opts.expectedBytes || 0;
    fs.mkdirSync(path.dirname(opts.dest), { recursive: true });
    // Windows：上次失败遗留的 .part 可能被杀软短暂占用，先尽力清理（带重试）
    fs.rmSync(tmp, { force: true, maxRetries: 5, retryDelay: 200 });
    out = fs.createWriteStream(tmp);
    const outStream = out;
    outStream.on('error', () => undefined); // 错误在 write/end 的 await 里统一抛出
    const hash = createHash('sha256');
    let received = 0;
    let lastEmit = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await guard(reader.read());
      if (done) break;
      arm();
      hash.update(value);
      received += value.byteLength;
      if (!outStream.write(value)) {
        await guard(
          new Promise<void>((r, j) => {
            outStream.once('drain', () => r());
            outStream.once('error', j);
          }),
        );
      }
      const now = Date.now();
      if (now - lastEmit > 150) {
        lastEmit = now;
        opts.onProgress?.({ received, total });
      }
    }
    await new Promise<void>((r, j) => outStream.end((e?: Error | null) => (e ? j(e) : r())));
    opts.onProgress?.({ received, total: total || received });
    const actual = hash.digest('hex');
    if (actual !== opts.sha256.toLowerCase()) throw new ChecksumError(opts.sha256, actual);
    // Windows：目标/临时文件可能被杀软扫描占用，rename 偶发 EPERM/EBUSY → 重试
    await renameWithRetry(tmp, opts.dest);
  } catch (e) {
    out?.destroy();
    fs.rmSync(tmp, { force: true, maxRetries: 5, retryDelay: 200 });
    if (timedOut && !(e instanceof DownloadTimeoutError)) {
      throw new DownloadTimeoutError(opts.idleTimeoutMs!);
    }
    throw e;
  } finally {
    cleanupTimer();
  }
}

/** rename 带重试：Windows 上 antivirus / indexer 持有句柄时会短暂 EPERM / EBUSY / EACCES。 */
export async function renameWithRetry(
  from: string,
  to: string,
  attempts = 8,
  delayMs = 150,
): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= attempts - 1 || !['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(code ?? '')) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

/** 安全拼路径：拒绝 ../ 与绝对路径（zip-slip） */
export function safeJoin(root: string, rel: string): string | null {
  const clean = rel.replace(/\\/g, '/');
  if (!clean || clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) return null;
  const out = path.resolve(root, clean);
  return out === root || out.startsWith(root + path.sep) ? out : null;
}

/** 解 zip，扁平化最外层目录（whisper 包内有一层目录） */
export function extractZip(buf: Uint8Array, destDir: string): string[] {
  const files = unzipSync(buf);
  return writeEntries(
    Object.entries(files).map(([name, data]) => ({ name, data, mode: 0o755 })),
    destDir,
  );
}

/** 最小 tar 解析（ustar；仅普通文件 / 目录 / 符号链接→复制目标），用于 .tar.gz */
export function parseTar(
  buf: Uint8Array,
): Array<{ name: string; data: Uint8Array; mode: number; link?: string }> {
  const out: Array<{ name: string; data: Uint8Array; mode: number; link?: string }> = [];
  const td = new TextDecoder();
  const str = (o: number, n: number) => td.decode(buf.subarray(o, o + n)).replace(/\0[\s\S]*$/, '');
  let off = 0;
  let longName: string | undefined;
  while (off + 512 <= buf.length) {
    if (buf[off] === 0) break;
    let name = str(off, 100);
    const prefix = str(off + 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    if (longName) {
      name = longName;
      longName = undefined;
    }
    const mode = parseInt(str(off + 100, 8).trim() || '644', 8);
    const size = parseInt(str(off + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const link = str(off + 157, 100);
    const data = buf.subarray(off + 512, off + 512 + size);
    if (type === 'L') longName = td.decode(data).replace(/\0[\s\S]*$/, '');
    else if (type === '0' || type === '\0') out.push({ name, data, mode });
    else if (type === '2' || type === '1') out.push({ name, data: new Uint8Array(), mode, link });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

export function extractTarGz(buf: Uint8Array, destDir: string): string[] {
  return writeEntries(parseTar(gunzipSync(buf)), destDir);
}

function writeEntries(
  entries: Array<{ name: string; data: Uint8Array; mode: number; link?: string }>,
  destDir: string,
): string[] {
  const files = entries.filter((e) => !e.name.endsWith('/'));
  // 去掉共同的顶层目录
  const tops = new Set(files.map((e) => e.name.replace(/\\/g, '/').split('/')[0]));
  const strip = tops.size === 1 && files.every((e) => e.name.includes('/'));
  const rel = (n: string) => (strip ? n.replace(/\\/g, '/').split('/').slice(1).join('/') : n);
  fs.mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const byName = new Map(files.map((e) => [rel(e.name), e]));
  for (const e of files) {
    const r = rel(e.name);
    const target = safeJoin(destDir, r);
    if (!target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let data = e.data;
    if (e.link) {
      // 符号链接：在包内解析后复制内容（避免在用户目录里创建链接）
      const linked = byName.get(path.posix.join(path.posix.dirname(r), e.link));
      if (!linked) continue;
      data = linked.data;
    }
    fs.writeFileSync(target, data, { mode: e.mode & 0o777 || 0o644 });
    written.push(r);
  }
  return written;
}
