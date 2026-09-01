/**
 * AIProvider —— 承载 ClientAIClient 单例的 React Context。
 *
 * - `client` 可以外部注入（首选：由 app 装配层集中管理生命周期），
 *   也可以让 Provider 自动构造（会在 `useEffect` 卸载时 dispose）；
 * - `useAIClient` 读不到 client 时抛出可辨识错误，避免 UI 里出现 `undefined.chat` 迷惑栈。
 */

import { createContext, useContext, useEffect, useMemo } from 'react';
import type { PropsWithChildren } from 'react';

import { ClientAIClient, type ClientAIClientOptions } from '../ClientAIClient';
import { SDKError, SDKErrorCodes } from '../errors';

export interface AIProviderProps extends ClientAIClientOptions {
  /** 直接传入外部持有的 client；一旦提供，Provider 不再自建/dispose。 */
  client?: ClientAIClient;
}

const AIClientContext = createContext<ClientAIClient | null>(null);

export function AIProvider(props: PropsWithChildren<AIProviderProps>) {
  const { client: external, bridge, bridgeName, live2dAvailable, children } = props;

  const owned = useMemo(() => {
    if (external) return null;
    return new ClientAIClient({ bridge, bridgeName, live2dAvailable });
  }, [external, bridge, bridgeName, live2dAvailable]);

  useEffect(() => {
    return () => {
      // 只有 Provider 自建的 client 才需要 dispose
      if (owned) void owned.dispose();
    };
  }, [owned]);

  const value = external ?? owned;
  return <AIClientContext.Provider value={value}>{children}</AIClientContext.Provider>;
}

export function useAIClient(): ClientAIClient {
  const c = useContext(AIClientContext);
  if (!c) {
    throw new SDKError(
      SDKErrorCodes.BRIDGE_MISSING,
      '<AIProvider> 未挂载；useAIClient 必须在其内部使用',
    );
  }
  return c;
}
