import { useEffect } from 'react';
import type { FC } from 'react';

import { mascotRegistry } from './MascotBackend';

import { lipSyncStore } from '@/ai/lipSyncStore';

/**
 * 与 AI 无关的驱动：TTS 音量包络 → 口型；鼠标位置 → 视线。
 */
const MascotDriver: FC = () => {
  useEffect(() => {
    const unLip = lipSyncStore.subscribe((rms) => mascotRegistry.current()?.setMouthOpen(rms));
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const y = 1 - (e.clientY / Math.max(1, window.innerHeight)) * 2;
      mascotRegistry.current()?.lookAt(x, y);
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      unLip();
      window.removeEventListener('mousemove', onMove);
    };
  }, []);
  return null;
};

export default MascotDriver;
