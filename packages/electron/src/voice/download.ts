/**
 * 按需下载：流式写临时文件 → sha256 校验 → 原子改名 / 解包。可取消，带进度回调。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import { unzipSync } from 'fflate';

export interface DownloadProgress {
  received: number;
  total: number;
}

export class ChecksumError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`校验失败：期望 ${expected.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…`);
  }
}

export type FetchLike = (url: string, init: { signal?: AbortSignal }) => Promise<Response>;

export async function downloadVerified(opts: {
  url: string;
  sha256: string;
  dest: string;
  expectedBytes?: number;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  fetchImpl?: FetchLike;
}): Promise<void> {
  const f = opts.fetchImpl ?? ((u, i) => fetch(u, { ...i, redirect: 'follow' }));
  const res = await f(opts.url, { signal: opts.signal });
  if (!res.ok || !res.body) throw new Error(`下载失败：HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || opts.expectedBytes || 0;
  fs.mkdirSync(path.dirname(opts.dest), { recursive: true });
  const tmp = `${opts.dest}.part`;
  const out = fs.createWriteStream(tmp);
  const hash = createHash('sha256');
  let received = 0;
  let lastEmit = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.byteLength;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      const now = Date.now();
      if (now - lastEmit > 150) {
        lastEmit = now;
        opts.onProgress?.({ received, total });
      }
    }
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
    opts.onProgress?.({ received, total: total || received });
    const actual = hash.digest('hex');
    if (actual !== opts.sha256.toLowerCase()) throw new ChecksumError(opts.sha256, actual);
    fs.renameSync(tmp, opts.dest);
  } catch (e) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw e;
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
