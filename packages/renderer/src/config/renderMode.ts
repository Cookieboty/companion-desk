import type { RenderMode } from '@ig-live/types';

/** 归一化持久化的显示模式：旧版本的 'live2d'（已移除）及未知值都回到 '3d'。 */
export function normalizeRenderMode(mode: unknown): RenderMode {
  return mode === 'custom-image' ? 'custom-image' : '3d';
}
