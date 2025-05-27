export interface AdaptiveConfig {
  enabled: boolean;

  // 基础参数
  baseViewSize: number;
  baseScale: number;

  // 缩放参数
  minScale: number;
  maxScale: number;
  sizeScaleFactor: number;

  // 视野扩展参数
  horizontalExpansion: number;
  verticalExpansion: number;

  // 不同宽高比的缩放调整
  wideScreenScale: number;
  tallScreenScale: number;

  // 位置调整规则
  aspectRatioRules: {
    ultraWide: { threshold: number; offsetX: number; offsetY: number; };
    wide: { threshold: number; offsetX: number; offsetY: number; };
    square: { threshold: number; offsetX: number; offsetY: number; };
    tall: { threshold: number; offsetX: number; offsetY: number; };
    ultraTall: { threshold: number; offsetX: number; offsetY: number; };
  };

  // 性能优化
  debounceDelay: number;
  enableCache: boolean;
  cacheSize: number;

  // 调试选项
  showDebugInfo: boolean;
  logAdaptiveChanges: boolean;
}

export interface AdaptiveParams {
  viewBounds: ViewBounds;
  modelScale: number;
  modelPosition: { x: number; y: number };
}

export interface ViewBounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface DisplaySize {
  width: number;
  height: number;
}

// 自适应缓存项
export interface AdaptiveCacheItem {
  params: AdaptiveParams;
  timestamp: number;
}

// 自适应状态
export interface AdaptiveState {
  canvasSize: CanvasSize;
  displaySize: DisplaySize;
  adaptiveConfig: AdaptiveConfig;
  isAdaptiveEnabled: boolean;
  lastUpdateTime: number;
} 