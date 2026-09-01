import { useTTSLipSync } from '@ig-live/ai-sdk-client/react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { lipSyncStore } from './lipSyncStore';

const WaifuLipSyncBridge: FC = () => {
  const rms = useTTSLipSync();

  useEffect(() => {
    lipSyncStore.set(rms);
  }, [rms]);

  useEffect(() => {
    return () => {
      lipSyncStore.reset();
    };
  }, []);

  return null;
};

export default WaifuLipSyncBridge;
