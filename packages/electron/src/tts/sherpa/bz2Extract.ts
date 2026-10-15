/**
 * 流式解压 .tar.bz2（unbzip2-stream + tar-stream）：不把 120MB+ 归档读进内存；
 * 只落地普通文件（目录按需创建），剥掉顶层目录，拒绝 ../ 与绝对路径（zip-slip）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import * as tar from 'tar-stream';
import unbzip2 from 'unbzip2-stream';

import { safeJoin } from '../../voice/download';

export async function extractTarBz2(
  archivePath: string,
  destDir: string,
  opts: { stripTop?: string; signal?: AbortSignal } = {},
): Promise<string[]> {
  const written: string[] = [];
  const extract = tar.extract();
  fs.mkdirSync(destDir, { recursive: true });
  const root = path.resolve(destDir);

  extract.on('entry', (header, stream, next) => {
    let rel = header.name.replace(/\\/g, '/');
    if (opts.stripTop) {
      const prefix = `${opts.stripTop}/`;
      rel = rel.startsWith(prefix) ? rel.slice(prefix.length) : rel === opts.stripTop ? '' : rel;
    }
    const target = header.type === 'file' && rel ? safeJoin(root, rel) : null;
    if (!target) {
      stream.resume();
      stream.on('end', next);
      return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const out = fs.createWriteStream(target, { mode: 0o644 });
    pipeline(stream, out).then(
      () => {
        written.push(rel);
        next();
      },
      (err) => next(err as Error),
    );
  });

  await pipeline(fs.createReadStream(archivePath), unbzip2(), extract, { signal: opts.signal });
  return written;
}
