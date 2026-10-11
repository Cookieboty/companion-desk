import { useEffect } from 'react';
import type { FC } from 'react';

import { interactionSettings } from '../../mascot/interaction/settings';
import { mascotRegistry } from '../../mascot/MascotBackend';

/**
 * Minimal pointer → lookAt / hit for sprite canvas (no R3F).
 * Full desktop physics still flows through electron mascotWindow APIs when present.
 */
const InteractionLite: FC = () => {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const b = mascotRegistry.current();
      if (!b) return;
      const cfg = interactionSettings.get();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight * 0.42;
      if (cfg.globalLook || (e.clientX >= 0 && e.clientY >= 0)) {
        b.lookAt(
          Math.max(-1, Math.min(1, (e.clientX - cx) / 280)),
          Math.max(-1, Math.min(1, -(e.clientY - cy) / 280)),
        );
      }
      // rough hit: center ellipse
      const dx = (e.clientX - cx) / (window.innerWidth * 0.28);
      const dy = (e.clientY - cy) / (window.innerHeight * 0.4);
      const hit = dx * dx + dy * dy <= 1;
      document.documentElement.dataset.mascotHit = hit ? '1' : '0';
      window.electronAPI?.mascotWindow?.setHit(hit);
    };
    window.addEventListener('pointermove', onMove);
    interactionSettings.push();
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return null;
};

export default InteractionLite;
