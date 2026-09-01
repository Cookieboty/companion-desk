/**
 * useUserProfile —— 读取 + 订阅 UserProfile；set/reset 直接透传到 IPC。
 *
 * 首次挂载：立即 `get()` 一次并渲染；之后订阅 `userProfile:changed` 事件更新。
 * 加载失败或未准备好时返回 `profile: undefined`。
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { SDKError } from '../errors';

import { useAIClient } from './AIProvider';

export interface UseUserProfileResult<P = unknown> {
  profile: P | undefined;
  loading: boolean;
  error?: SDKError;
  set: (patch: Partial<P>) => Promise<P | undefined>;
  reset: () => Promise<P | undefined>;
  refresh: () => Promise<void>;
}

export function useUserProfile<P = unknown>(): UseUserProfileResult<P> {
  const client = useAIClient();

  const stateRef = useRef<{
    profile: P | undefined;
    loading: boolean;
    error?: SDKError;
  }>({ profile: undefined, loading: true });
  const versionRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());

  const notify = useCallback(() => {
    versionRef.current += 1;
    for (const l of listenersRef.current) l();
  }, []);

  const userProfile = client.memory.userProfile as {
    get: () => Promise<P>;
    set: (patch: Partial<P>) => Promise<P>;
    reset: () => Promise<P>;
    subscribe: (fn: (p: P) => void) => () => void;
  };

  const refresh = useCallback(async () => {
    stateRef.current = { ...stateRef.current, loading: true, error: undefined };
    notify();
    try {
      const profile = await userProfile.get();
      stateRef.current = { profile, loading: false };
    } catch (err) {
      stateRef.current = {
        profile: undefined,
        loading: false,
        error: err instanceof SDKError ? err : SDKError.fromIpc(err),
      };
    } finally {
      notify();
    }
  }, [userProfile, notify]);

  useEffect(() => {
    void refresh();
    const off = userProfile.subscribe((p) => {
      stateRef.current = { ...stateRef.current, profile: p, loading: false };
      notify();
    });
    return () => off();
  }, [refresh, userProfile, notify]);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);
  const getSnapshot = useCallback(() => versionRef.current, []);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const set = useCallback(
    async (patch: Partial<P>) => {
      try {
        const p = await userProfile.set(patch);
        stateRef.current = { profile: p, loading: false };
        notify();
        return p;
      } catch (err) {
        stateRef.current = {
          ...stateRef.current,
          error: err instanceof SDKError ? err : SDKError.fromIpc(err),
        };
        notify();
        return undefined;
      }
    },
    [userProfile, notify],
  );

  const reset = useCallback(async () => {
    try {
      const p = await userProfile.reset();
      stateRef.current = { profile: p, loading: false };
      notify();
      return p;
    } catch (err) {
      stateRef.current = {
        ...stateRef.current,
        error: err instanceof SDKError ? err : SDKError.fromIpc(err),
      };
      notify();
      return undefined;
    }
  }, [userProfile, notify]);

  return {
    profile: stateRef.current.profile,
    loading: stateRef.current.loading,
    error: stateRef.current.error,
    set,
    reset,
    refresh,
  };
}
