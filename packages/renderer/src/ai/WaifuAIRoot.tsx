import { AIProvider } from '@ig-live/ai-sdk-client/react';
import React, { useMemo } from 'react';
import type { FC, PropsWithChildren } from 'react';

import { isAiIpcReady } from './env';
import WaifuLipSyncBridge from './WaifuLipSyncBridge';

declare global {
  interface Window {
    aiIPC?: unknown;
  }
}

const WaifuAIRoot: FC<PropsWithChildren> = ({ children }) => {
  const ready = useMemo(() => isAiIpcReady(), []);

  if (!ready) {
    return <>{children}</>;
  }

  return (
    <AIProvider>
      <WaifuLipSyncBridge />
      {children}
    </AIProvider>
  );
};

export default WaifuAIRoot;
