import { AIProvider } from '@ig-live/ai-sdk-client/react';
import React, { useMemo } from 'react';
import type { FC, PropsWithChildren } from 'react';

import WaifuLipSyncBridge from './WaifuLipSyncBridge';

declare global {
  interface Window {
    aiIPC?: unknown;
  }
}

function isAiIpcReady(): boolean {
  return typeof window !== 'undefined' && typeof window.aiIPC !== 'undefined' && window.aiIPC !== null;
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