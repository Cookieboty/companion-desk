/**
 * 通道快照一致性 —— 客户端的 IPC_METHODS 必须与主进程 ai-runtime 完全一致（结构 + 顺序）。
 *
 * 之所以做 order-sensitive 断言：白名单顺序影响 `IPCTransportServer.registered` 序，
 * 若日志/监控依赖前 6 条通道做发布检查，顺序漂移可能导致误报。
 */

import { describe, expect, it } from 'vitest';

import { IPC_METHODS as runtimeMethods } from '../../ai-runtime/src/channels';
import { IPC_METHODS as clientMethods } from '../src/channels';

describe('channels · client ↔ runtime 快照对齐', () => {
  it('长度一致', () => {
    expect(clientMethods.length).toBe(runtimeMethods.length);
  });

  it('每条 entry 的 (facade, method, kind, dangerous) 相同且顺序不漂移', () => {
    const normalize = (list: readonly (typeof clientMethods)[number][]) =>
      list.map((s) => ({
        facade: s.facade,
        method: s.method,
        kind: s.kind,
        dangerous: !!s.dangerous,
      }));
    expect(normalize(clientMethods)).toEqual(normalize(runtimeMethods));
  });
});
