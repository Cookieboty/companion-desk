import { AdaptiveConfig } from '@/types/adaptive';

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  enabled: false, // 暂时禁用自适应功能，专注于修复基础模型显示问题

  baseViewSize: 1.0, // 不再使用，保留兼容性
  baseScale: 2.0,

  minScale: 0.5,
  maxScale: 4.0,
  sizeScaleFactor: 0.5,

  horizontalExpansion: 1.0,
  verticalExpansion: 1.0,

  wideScreenScale: 0.9,
  tallScreenScale: 1.1,

  aspectRatioRules: {
    ultraWide: { threshold: 2.0, offsetX: 0.1, offsetY: 0 },
    wide: { threshold: 1.5, offsetX: 0.05, offsetY: 0 },
    square: { threshold: 1.2, offsetX: 0, offsetY: 0 },
    tall: { threshold: 0.8, offsetX: 0, offsetY: 0.05 },
    ultraTall: { threshold: 0.5, offsetX: 0, offsetY: 0.1 }
  },

  debounceDelay: 100,
  enableCache: true,
  cacheSize: 50,

  showDebugInfo: process.env.NODE_ENV === 'development' ? true : false,
  logAdaptiveChanges: true
}; 