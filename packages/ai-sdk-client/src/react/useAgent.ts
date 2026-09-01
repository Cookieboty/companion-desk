/**
 * useAgent —— 展示"当前 agent 想干什么" + 危险工具二次确认。
 *
 * 订阅两个业务事件：
 * - `agent:step` —— 展示 step 信息（可选，业务侧决定是否显示为气泡）；
 * - `tool:confirm-required` —— 弹出确认队列；调用 `confirm(reqId, ok)` 回执给主进程。
 *
 * 采用 `useSyncExternalStore` 保证在并发渲染下事件与状态一致。
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { useAIClient } from './AIProvider';

export interface AgentStepView {
  sessionId: string;
  step: number;
  reason: string;
  at: number;
}

export interface ToolConfirmView {
  reqId: string;
  toolName: string;
  argumentsJson: string;
  reason?: string;
  createdAt: number;
}

export interface UseAgentResult {
  lastStep?: AgentStepView;
  pendingConfirms: readonly ToolConfirmView[];
  confirm: (reqId: string, ok: boolean, reason?: string) => void;
}

export function useAgent(): UseAgentResult {
  const client = useAIClient();

  // 用可变引用作为 store 的载体，避免每次事件都触发全量拷贝。
  const stateRef = useRef<{
    lastStep?: AgentStepView;
    pendingConfirms: ToolConfirmView[];
  }>({ pendingConfirms: [] });
  const listenersRef = useRef(new Set<() => void>());
  const versionRef = useRef(0);

  const notify = useCallback(() => {
    versionRef.current += 1;
    for (const l of listenersRef.current) l();
  }, []);

  useEffect(() => {
    const offStep = client.on('agent:step', (p) => {
      const payload = p as {
        sessionId?: string;
        step?: number;
        reason?: string;
      };
      stateRef.current = {
        ...stateRef.current,
        lastStep: {
          sessionId: payload.sessionId ?? '',
          step: payload.step ?? 0,
          reason: payload.reason ?? 'llm-call',
          at: Date.now(),
        },
      };
      notify();
    });
    const offConfirm = client.on('tool:confirm-required', (p) => {
      const req = p as ToolConfirmView;
      stateRef.current = {
        ...stateRef.current,
        pendingConfirms: [...stateRef.current.pendingConfirms, req],
      };
      notify();
    });
    const offExec = client.on('tool:executed', (p) => {
      const payload = p as { reqId?: string };
      if (!payload?.reqId) return;
      const before = stateRef.current.pendingConfirms;
      const after = before.filter((c) => c.reqId !== payload.reqId);
      if (after.length !== before.length) {
        stateRef.current = { ...stateRef.current, pendingConfirms: after };
        notify();
      }
    });
    return () => {
      offStep();
      offConfirm();
      offExec();
    };
  }, [client, notify]);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);
  const getSnapshot = useCallback(() => versionRef.current, []);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const confirm = useCallback(
    (reqId: string, ok: boolean, reason?: string) => {
      const tools = client.tools as {
        confirm: (reqId: string, ok: boolean, reason?: string) => void;
      };
      tools.confirm(reqId, ok, reason);
      const before = stateRef.current.pendingConfirms;
      const after = before.filter((c) => c.reqId !== reqId);
      if (after.length !== before.length) {
        stateRef.current = { ...stateRef.current, pendingConfirms: after };
        notify();
      }
    },
    [client, notify],
  );

  return {
    lastStep: stateRef.current.lastStep,
    pendingConfirms: stateRef.current.pendingConfirms,
    confirm,
  };
}
