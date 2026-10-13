/**
 * Mascot window size (pure; shared by WindowManager, config migration and tests).
 *
 * The character is drawn in a box of BASE·scale (BASE = the old 420×450 window that the
 * character used to fill). Around it the window keeps a small transparent margin for the
 * toolbar slot (sides) and the speech bubble (above the head). Transparent pixels are
 * click-through (per-pixel hit test), so the margin never blocks the desktop.
 *
 * Keep MASCOT_PAD in sync with packages/renderer/src/mascot/spriteLayout.ts (tested there).
 */
export const MASCOT_BASE = { width: 420, height: 450 } as const;
export const MASCOT_PAD = { x: 60, top: 130 } as const;
/** default = half of the previous on-screen size */
export const DEFAULT_MASCOT_SCALE = 0.5;
export const MIN_MASCOT_SCALE = 0.3;
export const MAX_MASCOT_SCALE = 1;

export function clampMascotScale(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_MASCOT_SCALE;
  return Math.min(MAX_MASCOT_SCALE, Math.max(MIN_MASCOT_SCALE, n));
}

export function mascotWindowSize(scale: number): { width: number; height: number } {
  const s = clampMascotScale(scale);
  return {
    width: Math.round(MASCOT_BASE.width * s + 2 * MASCOT_PAD.x),
    height: Math.round(MASCOT_BASE.height * s + MASCOT_PAD.top),
  };
}

/**
 * One-time migration for configs written before `mascotScale` existed: those users were on the
 * old full-size default, so they move to the new half-size default. The saved window position
 * (top-left of the old 420×450 window) is shifted so the character keeps its bottom-centre
 * anchor on screen instead of jumping up-left.
 */
export function migrateMascotSize(loaded: Record<string, unknown> | null | undefined): {
  mascotScale: number;
  windowPosition?: { x: number; y: number };
  migrated: boolean;
} {
  if (loaded && typeof loaded.mascotScale === 'number') {
    return { mascotScale: clampMascotScale(loaded.mascotScale), migrated: false };
  }
  const pos = loaded?.windowPosition as { x?: unknown; y?: unknown } | undefined;
  const next = mascotWindowSize(DEFAULT_MASCOT_SCALE);
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && (pos.x > 0 || pos.y > 0)) {
    return {
      mascotScale: DEFAULT_MASCOT_SCALE,
      windowPosition: {
        x: Math.round(pos.x + (MASCOT_BASE.width - next.width) / 2),
        y: Math.round(pos.y + (MASCOT_BASE.height - next.height)),
      },
      migrated: true,
    };
  }
  return { mascotScale: DEFAULT_MASCOT_SCALE, migrated: !!loaded };
}
