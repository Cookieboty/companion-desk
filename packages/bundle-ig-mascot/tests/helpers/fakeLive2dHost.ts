import type { Live2dEvent, Live2dEventPayload, Live2dHost } from '../../src/seams/live2d';

/**
 * FakeLive2dHost —— 单测用假 host。
 * - 记录所有 host 方法调用
 * - 提供 emit(evt, payload) 主动触发 seam 转发
 */
export interface FakeLive2dHostRecord {
  playMotion: Array<{ group: string; index?: number }>;
  setExpression: string[];
  driveLipSync: number[];
  setParameter: Array<{ id: string; value: number }>;
}

export interface FakeLive2dHost extends Live2dHost {
  readonly record: FakeLive2dHostRecord;
  emit<E extends Live2dEvent>(evt: E, payload: Live2dEventPayload<E>): void;
  fail(kind: 'playMotion' | 'setExpression', err: Error): void;
}

export function createFakeLive2dHost(): FakeLive2dHost {
  const listeners = new Map<Live2dEvent, Set<(p: unknown) => void>>();
  const failures = new Map<'playMotion' | 'setExpression', Error>();

  const record: FakeLive2dHostRecord = {
    playMotion: [],
    setExpression: [],
    driveLipSync: [],
    setParameter: [],
  };

  return {
    record,
    async playMotion(group, index) {
      const err = failures.get('playMotion');
      if (err) throw err;
      record.playMotion.push({ group, index });
    },
    async setExpression(name) {
      const err = failures.get('setExpression');
      if (err) throw err;
      record.setExpression.push(name);
    },
    driveLipSync(rms) {
      record.driveLipSync.push(rms);
    },
    setParameter(id, value) {
      record.setParameter.push({ id, value });
    },
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      const set = listeners.get(evt)!;
      set.add(fn as (p: unknown) => void);
      return () => {
        set.delete(fn as (p: unknown) => void);
      };
    },
    emit(evt, payload) {
      listeners.get(evt)?.forEach((fn) => fn(payload));
    },
    fail(kind, err) {
      failures.set(kind, err);
    },
  };
}
