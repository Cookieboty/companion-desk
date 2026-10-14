import type { BodyRegion } from './interaction/regions';
import type { Box } from './layoutStore';
import type { MascotBackend } from './MascotBackend';

export interface MascotRegistryLike {
  current(): Pick<MascotBackend, 'lookAt'> | null;
}

/** Body region of a point on the 2D figure (pure; drives hover / click reactions). */
export function regionInSprite(
  x: number,
  y: number,
  head: Box | null,
  body: Box | null,
): BodyRegion {
  if (head && x >= head.left && x <= head.right && y >= head.top && y <= head.bottom) {
    // upper ~45% of the head box is hair / crown, the rest is the face
    return y < head.top + (head.bottom - head.top) * 0.45 ? 'head' : 'face';
  }
  if (body) {
    const w = body.right - body.left;
    const top = head ? head.bottom : body.top;
    const h = Math.max(1, body.bottom - top);
    if (x < body.left + w * 0.2 || x > body.right - w * 0.2) return 'hands';
    if (y > top + h * 0.6) return 'skirt';
  }
  return 'body';
}
