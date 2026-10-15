/**
 * 侧栏搜索用的「磁盘历史会话索引」：搜索激活后才向主进程取，分块（500 条 / 块）、
 * 自动取到每端 2000 条为止；之后由「搜索更早的历史」按钮继续取下一块。
 * 数据在主进程里是增量解析的（只重读变化的文件），界面只做防抖后的内存过滤，不整盘扫描。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  HISTORY_BACKENDS,
  historyClient,
  type HistoryBackend,
  type HistorySession,
} from '../services/historyClient';

const CHUNK = 500;
export const AUTO_LIMIT = 2000;

interface Slot {
  items: HistorySession[];
  next: number | null;
  done: boolean;
}
const empty = (): Record<HistoryBackend, Slot> => ({
  claude: { items: [], next: 0, done: false },
  codex: { items: [], next: 0, done: false },
  dsh: { items: [], next: 0, done: false },
});

export interface HistorySearchIndex {
  items: HistorySession[];
  loading: boolean;
  /** 还有更早的历史没取 */
  hasMore: boolean;
  more: () => void;
}

export function useHistorySearchIndex(
  enabled: boolean,
  backends: readonly HistoryBackend[],
  version: unknown,
): HistorySearchIndex {
  const [slots, setSlots] = useState<Record<HistoryBackend, Slot>>(empty);
  const [loading, setLoading] = useState(false);
  /** 本轮自动索引是否已经跑完（之前显示 loading，且「更早的历史」按钮不出现） */
  const [ready, setReady] = useState(false);
  const seq = useRef(0);
  const slotsRef = useRef(slots);
  const key = backends.join(',');

  const fetchOne = useCallback(
    async (b: HistoryBackend, my: number, force: boolean, cap: number) => {
      let offset = slotsRef.current[b].next ?? 0;
      let first = force;
      for (;;) {
        const page = await historyClient.index(b, { offset, limit: CHUNK, force: first });
        first = false;
        if (my !== seq.current) return;
        const next = page?.hasMore ? (page.nextOffset ?? null) : null;
        setSlots((s) => ({
          ...s,
          [b]: { items: [...s[b].items, ...(page?.items ?? [])], next, done: next === null },
        }));
        slotsRef.current = {
          ...slotsRef.current,
          [b]: {
            items: [...slotsRef.current[b].items, ...(page?.items ?? [])],
            next,
            done: next === null,
          },
        };
        if (next === null) return;
        offset = next;
        if (slotsRef.current[b].items.length >= cap) return;
        // 让出主线程，给输入留出空隙
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !historyClient.available()) return;
    const my = ++seq.current;
    const fresh = empty();
    slotsRef.current = fresh;
    setSlots(fresh);
    setReady(false);
    setLoading(true);
    void Promise.all(
      HISTORY_BACKENDS.filter((b) => backends.includes(b)).map((b) =>
        fetchOne(b, my, true, AUTO_LIMIT).catch(() => undefined),
      ),
    ).finally(() => {
      if (my === seq.current) {
        setLoading(false);
        setReady(true);
      }
    });
    return () => {
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, version, fetchOne]);

  const more = useCallback(() => {
    const my = ++seq.current;
    setLoading(true);
    void Promise.all(
      HISTORY_BACKENDS.filter((b) => backends.includes(b) && !slotsRef.current[b].done).map((b) =>
        fetchOne(b, my, false, slotsRef.current[b].items.length + CHUNK).catch(() => undefined),
      ),
    ).finally(() => {
      if (my === seq.current) setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetchOne]);

  const items = useMemo(
    () => HISTORY_BACKENDS.filter((b) => backends.includes(b)).flatMap((b) => slots[b].items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, key],
  );
  const hasMore = ready && HISTORY_BACKENDS.some((b) => backends.includes(b) && !slots[b].done);
  return { items, loading: enabled && (loading || !ready), hasMore, more };
}
