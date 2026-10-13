import React, { useEffect, useRef, useState } from 'react';

import {
  createSpriteBackend,
  loadSpriteManifest,
  type SpriteBackend,
} from '../../mascot/backends/sprite';
import { mascotRegistry } from '../../mascot/MascotBackend';

import MascotInteractionLayerLite from './InteractionLite';

export interface SpriteCanvasProps {
  /** URL to manifest.json */
  manifestPath: string;
  className?: string;
  style?: React.CSSProperties;
  transparent?: boolean;
}

/**
 * 2D expression-swapped mascot (soft PNG or pixel pet). No Live2D / no three.js.
 */
export const SpriteCanvas: React.FC<SpriteCanvasProps> = ({
  manifestPath,
  className = '',
  style,
  transparent = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backendRef = useRef<SpriteBackend | null>(null);
  const imgs = useRef(new Map<string, HTMLImageElement>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styleKind, setStyleKind] = useState('soft');
  const styleKindRef = useRef('soft');

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;
    let raf = 0;
    setReady(false);
    setError(null);
    loadSpriteManifest(manifestPath)
      .then(({ manifest, baseUrl }) => {
        if (cancelled) return;
        const backend = createSpriteBackend(manifest, baseUrl);
        backendRef.current = backend;
        detach = mascotRegistry.attach(backend);
        const sk = manifest.style || 'soft';
        styleKindRef.current = sk;
        setStyleKind(sk);
        // preload
        const files = new Set([
          ...Object.values(manifest.expressions),
          manifest.blink,
          manifest.mouthOpen,
        ]);
        const loads = [...files].filter(Boolean).map(
          (f) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                imgs.current.set(`${baseUrl}${f}`, img);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = `${baseUrl}${f}`;
            }),
        );
        return Promise.all(loads).then(() => {
          if (cancelled) return;
          setReady(true);
          document.documentElement.dataset.mascotModel = manifest.id;
          console.info('[perf] mascot-model-loaded');
          console.info('[perf] sprite-model-loaded', manifest.id);
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const backend = backendRef.current;
      const canvas = canvasRef.current;
      if (!backend || !canvas) return;
      backend.update(dt, now / 1000);
      const frame = backend.snapshot();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const img = imgs.current.get(frame.expressionUrl);
      if (!img) return;
      const scale = Math.min((w * 0.85) / img.width, (h * 0.9) / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const lookOffX = frame.lookX * 8;
      const lookOffY = -frame.lookY * 6;
      const x = (w - dw) / 2 + lookOffX;
      const y = (h - dh) / 2 + frame.bobY + lookOffY;
      if (styleKindRef.current === 'pixel') {
        ctx.imageSmoothingEnabled = false;
      } else {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      ctx.drawImage(img, x, y, dw, dh);
      if (frame.blinkOpacity > 0.01 && backend.manifest.blink) {
        const b = imgs.current.get(
          `${backend.baseUrl}${backend.manifest.blink}`.replace(/([^:]\/)\/+/g, '$1'),
        );
        // resolve blink url same as snapshot
        const blinkUrl = frame.expressionUrl.replace(/[^/]+$/, backend.manifest.blink!);
        const blinkImg = imgs.current.get(blinkUrl) ?? b;
        if (blinkImg) {
          ctx.globalAlpha = frame.blinkOpacity;
          ctx.drawImage(blinkImg, x, y, dw, dh);
          ctx.globalAlpha = 1;
        }
      }
      if (frame.mouthOpacity > 0.02 && frame.mouthUrl) {
        const m = imgs.current.get(frame.mouthUrl);
        if (m) {
          ctx.globalAlpha = frame.mouthOpacity;
          ctx.drawImage(m, x, y, dw, dh);
          ctx.globalAlpha = 1;
        }
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      detach?.();
      backendRef.current?.dispose();
      backendRef.current = null;
    };
  }, [manifestPath]);

  return (
    <div
      className={className}
      data-testid="sprite-canvas"
      data-sprite-style={styleKind}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: transparent ? 'transparent' : '#1e2430',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          imageRendering: styleKind === 'pixel' ? 'pixelated' : 'auto',
        }}
      />
      {ready && <MascotInteractionLayerLite />}
      {!ready && !error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ccc',
            fontSize: 13,
          }}
        >
          Loading 2D sprite…
        </div>
      )}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f88',
            fontSize: 13,
          }}
        >
          Sprite error: {error}
        </div>
      )}
    </div>
  );
};

export default SpriteCanvas;
