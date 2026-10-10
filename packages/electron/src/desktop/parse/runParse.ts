import * as fs from 'fs';
import * as path from 'path';

import { extract, type Extracted } from './extract';

export interface ParseOptions {
  timeoutMs?: number;
  maxBytes?: number;
  memoryMb?: number;
}

export type ParseResult = ({ ok: true } & Extracted) | { ok: false; code: string; message: string };

type Utility = {
  fork(
    modulePath: string,
    args?: string[],
    opts?: { execArgv?: string[]; serviceName?: string; stdio?: 'ignore' | 'inherit' | 'pipe' },
  ): {
    postMessage(m: unknown): void;
    on(ev: 'message', fn: (m: unknown) => void): void;
    on(ev: 'exit', fn: (code: number) => void): void;
    kill(): boolean;
  };
};

function utility(): Utility | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 单测（纯 Node）里没有 electron
    const e = require('electron') as { utilityProcess?: Utility };
    return e && typeof e === 'object' && e.utilityProcess ? e.utilityProcess : null;
  } catch {
    return null;
  }
}

/**
 * 在独立的 utilityProcess 中解析文档：超时（默认 20s）或内存超限（默认 256MB 堆）即杀死并返回错误。
 * 没有 Electron（单测）时退回进程内解析（仍有大小上限）。
 */
export async function parseFile(filePath: string, opts: ParseOptions = {}): Promise<ParseResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxBytes = opts.maxBytes ?? 50 * 1024 * 1024;
  const up = utility();
  const workerPath = path.join(__dirname, 'worker.js');
  if (!up || !fs.existsSync(workerPath)) {
    try {
      const st = await fs.promises.stat(filePath);
      if (st.size > maxBytes)
        return { ok: false, code: 'too_large', message: `文件过大（${st.size} 字节）` };
      const buf = await fs.promises.readFile(filePath);
      return { ok: true, ...(await extract(new Uint8Array(buf), filePath)) };
    } catch (err) {
      return {
        ok: false,
        code: (err as { code?: string }).code ?? 'parse_failed',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return new Promise<ParseResult>((resolve) => {
    const child = up.fork(workerPath, [], {
      execArgv: [`--max-old-space-size=${opts.memoryMb ?? 256}`],
      serviceName: 'companion-desk-parse',
      stdio: 'ignore',
    });
    let done = false;
    const finish = (r: ParseResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, code: 'timeout', message: `解析超时（${timeoutMs / 1000}s）` }),
      timeoutMs,
    );
    child.on('message', (m) => finish(m as ParseResult));
    child.on('exit', (code) =>
      finish({
        ok: false,
        code: 'crashed',
        message: `解析进程异常退出（${code}），可能超出内存限制`,
      }),
    );
    child.postMessage({ path: filePath, maxBytes });
  });
}
