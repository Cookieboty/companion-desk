import { rmSync } from 'node:fs';

/** Windows：Electron 退出后文件句柄可能还没释放，临时目录清理失败不应让测试失败。 */
export function safeRm(p: string): void {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  } catch {
    /* 临时目录，留给系统清理 */
  }
}
