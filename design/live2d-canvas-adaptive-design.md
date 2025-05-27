# Live2D模型Canvas自适应设计方案（项目深度分析版）

## 1. 项目架构深度分析

### 1.1 当前项目结构
基于对项目代码的深度分析，当前架构包含：

**核心组件层次**：
- `Live2DCanvas.tsx` - Canvas容器组件，固定尺寸800x800，显示为250x250
- `useLive2DModel.ts` - 模型管理Hook，处理模型加载和状态
- `Live2DContext.tsx` - 全局状态管理，使用useReducer模式
- `Cubism2Model` - 底层Live2D引擎封装类

**当前问题识别**：
1. **硬编码尺寸**：Canvas固定为800x800像素，CSS显示为250x250px
2. **静态视图矩阵**：视图范围计算基于固定比例，无自适应逻辑
3. **缺乏响应式机制**：无ResizeObserver或窗口尺寸变化监听
4. **模型布局固定**：模型矩阵设置为固定的width=2，centerPosition(0,0)

### 1.2 关键代码分析

#### 1.2.1 当前Canvas初始化逻辑
```typescript
// packages/renderer/src/components/Live2D/Live2DCanvas.tsx
<canvas
  id="live2d"
  ref={canvasRef}
  width="800"        // 硬编码像素尺寸
  height="800"       // 硬编码像素尺寸
  style={{
    width: '250px',   // CSS显示尺寸
    height: '250px',  // CSS显示尺寸
    position: 'absolute',
    bottom: '0',
    left: '0'
  }}
/>
```

#### 1.2.2 当前视图矩阵计算
```typescript
// packages/renderer/src/cubism2/index.ts (第52-85行)
const width = this.canvas.width;   // 固定800
const height = this.canvas.height; // 固定800
const ratio = height / width;      // 固定1.0

const left = LAppDefine.VIEW_LOGICAL_LEFT;    // 固定值
const right = LAppDefine.VIEW_LOGICAL_RIGHT;  // 固定值
const bottom = -ratio;  // 固定-1
const top = ratio;      // 固定1

this.viewMatrix.setScreenRect(left, right, bottom, top);
```

#### 1.2.3 当前模型矩阵设置
```typescript
// packages/renderer/src/cubism2/Live2DFramework.ts (第175-185行)
this.modelMatrix = new L2DModelMatrix(
  this.live2DModel.getCanvasWidth(),
  this.live2DModel.getCanvasHeight(),
);
this.modelMatrix.setWidth(2);           // 固定宽度
this.modelMatrix.setCenterPosition(0, 0); // 固定居中
```

### 1.3 官方Demo对比分析
根据Live2D官方TypeScript示例的最佳实践：

1. **动态视图计算**：根据Canvas实际尺寸计算视图边界
2. **自适应投影矩阵**：考虑宽高比的投影变换
3. **智能模型缩放**：基于Canvas和模型尺寸的最优缩放
4. **响应式布局**：实时响应容器尺寸变化

## 2. 针对性设计方案

### 2.1 架构改进策略

#### 2.1.1 增强Live2DContext状态管理
```typescript
// 扩展Live2DState接口
export interface Live2DState {
  // ... 现有属性
  canvasSize: { width: number; height: number };
  displaySize: { width: number; height: number };
  adaptiveConfig: AdaptiveConfig;
  isAdaptiveEnabled: boolean;
}

// 新增Action类型
type Live2DAction = 
  // ... 现有类型
  | { type: 'SET_CANVAS_SIZE'; payload: { width: number; height: number } }
  | { type: 'SET_DISPLAY_SIZE'; payload: { width: number; height: number } }
  | { type: 'UPDATE_ADAPTIVE_CONFIG'; payload: Partial<AdaptiveConfig> }
  | { type: 'TOGGLE_ADAPTIVE'; payload: boolean };
```

#### 2.1.2 创建自适应管理Hook
```typescript
// packages/renderer/src/hooks/useCanvasAdaptive.ts
export function useCanvasAdaptive(canvasRef: RefObject<HTMLCanvasElement>) {
  const { state, dispatch } = useLive2D();
  const [adaptiveParams, setAdaptiveParams] = useState<AdaptiveParams | null>(null);
  
  // ResizeObserver监听
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        handleCanvasResize(entry.contentRect);
      }
    });
    
    resizeObserver.observe(canvasRef.current);
    return () => resizeObserver.disconnect();
  }, [canvasRef]);
  
  // 计算自适应参数
  const calculateAdaptiveParams = useCallback((
    canvasWidth: number, 
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): AdaptiveParams => {
    // 实现自适应计算逻辑
  }, [state.adaptiveConfig]);
  
  return { adaptiveParams, calculateAdaptiveParams };
}
```

#### 2.1.3 扩展Cubism2Model类
```typescript
// packages/renderer/src/cubism2/index.ts
export class Cubism2Model {
  // ... 现有属性
  private adaptiveConfig: AdaptiveConfig | null = null;
  private lastCanvasSize: { width: number; height: number } | null = null;
  
  // 新增自适应初始化方法
  initWithAdaptive(
    canvasId: string, 
    modelSettingPath: string, 
    modelSetting: any,
    adaptiveConfig: AdaptiveConfig
  ): Promise<void> {
    this.adaptiveConfig = adaptiveConfig;
    return this.init(canvasId, modelSettingPath, modelSetting);
  }
  
  // 新增自适应更新方法
  updateAdaptiveLayout(
    canvasWidth: number, 
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): void {
    if (!this.adaptiveConfig?.enabled) return;
    
    // 计算新的视图参数
    const adaptiveParams = this.calculateAdaptiveParams(
      canvasWidth, canvasHeight, displayWidth, displayHeight
    );
    
    // 应用新的矩阵设置
    this.applyAdaptiveMatrices(adaptiveParams);
  }
  
  private calculateAdaptiveParams(
    canvasWidth: number, 
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): AdaptiveParams {
    const canvasAspect = canvasWidth / canvasHeight;
    const displayAspect = displayWidth / displayHeight;
    
    // 动态视图边界计算
    const viewBounds = this.calculateViewBounds(canvasAspect);
    
    // 智能模型缩放计算
    const modelScale = this.calculateModelScale(
      canvasWidth, canvasHeight, displayWidth, displayHeight
    );
    
    // 动态位置调整
    const modelPosition = this.calculateModelPosition(canvasAspect);
    
    return { viewBounds, modelScale, modelPosition };
  }
  
  private calculateViewBounds(aspectRatio: number): ViewBounds {
    const config = this.adaptiveConfig!;
    const baseSize = config.baseViewSize || 2.0;
    
    if (aspectRatio > 1) {
      // 横屏：扩展水平视野
      return {
        left: -baseSize * aspectRatio * config.horizontalExpansion,
        right: baseSize * aspectRatio * config.horizontalExpansion,
        bottom: -baseSize,
        top: baseSize
      };
    } else {
      // 竖屏：扩展垂直视野
      return {
        left: -baseSize,
        right: baseSize,
        bottom: -baseSize / aspectRatio * config.verticalExpansion,
        top: baseSize / aspectRatio * config.verticalExpansion
      };
    }
  }
  
  private calculateModelScale(
    canvasWidth: number, 
    canvasHeight: number,
    displayWidth: number,
    displayHeight: number
  ): number {
    const config = this.adaptiveConfig!;
    
    // 基于显示尺寸计算缩放
    const displayAspect = displayWidth / displayHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    
    let baseScale = config.baseScale || 2.0;
    
    // 根据显示尺寸调整基础缩放
    const sizeRatio = Math.min(displayWidth / 250, displayHeight / 250);
    baseScale *= Math.pow(sizeRatio, config.sizeScaleFactor || 0.5);
    
    // 应用宽高比调整
    if (Math.abs(displayAspect - 1.0) > 0.1) {
      if (displayAspect > 1.2) {
        // 宽屏：稍微缩小避免过宽
        baseScale *= config.wideScreenScale || 0.9;
      } else if (displayAspect < 0.8) {
        // 高屏：稍微放大利用垂直空间
        baseScale *= config.tallScreenScale || 1.1;
      }
    }
    
    // 限制在最小最大范围内
    return Math.max(
      config.minScale || 0.5,
      Math.min(config.maxScale || 4.0, baseScale)
    );
  }
  
  private calculateModelPosition(aspectRatio: number): { x: number; y: number } {
    const config = this.adaptiveConfig!;
    
    // 根据宽高比应用位置规则
    for (const [key, rule] of Object.entries(config.aspectRatioRules)) {
      if (this.matchesAspectRatioRule(aspectRatio, rule)) {
        return { x: rule.offsetX, y: rule.offsetY };
      }
    }
    
    return { x: 0, y: 0 }; // 默认居中
  }
  
  private applyAdaptiveMatrices(params: AdaptiveParams): void {
    if (!this.viewMatrix || !this.projMatrix || !this.live2DMgr) return;
    
    // 更新视图矩阵
    this.viewMatrix.setScreenRect(
      params.viewBounds.left,
      params.viewBounds.right,
      params.viewBounds.bottom,
      params.viewBounds.top
    );
    
    // 更新模型矩阵
    const model = this.live2DMgr.getModel();
    if (model && model.modelMatrix) {
      model.modelMatrix.setWidth(params.modelScale);
      model.modelMatrix.setCenterPosition(
        params.modelPosition.x,
        params.modelPosition.y
      );
    }
  }
}
```

### 2.2 组件层改进

#### 2.2.1 增强Live2DCanvas组件
```typescript
// packages/renderer/src/components/Live2D/Live2DCanvas.tsx
export const Live2DCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, config, dispatch } = useLive2D();
  const { cubism2Model } = useLive2DModel();
  const { adaptiveParams } = useCanvasAdaptive(canvasRef);
  
  // 动态Canvas尺寸计算
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 800 });
  const [displaySize, setDisplaySize] = useState({ width: 250, height: 250 });
  
  // 监听容器尺寸变化
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        
        // 更新显示尺寸
        setDisplaySize({ width, height });
        
        // 计算Canvas内部尺寸（保持高DPI）
        const dpr = window.devicePixelRatio || 1;
        const canvasWidth = Math.floor(width * dpr);
        const canvasHeight = Math.floor(height * dpr);
        
        setCanvasSize({ width: canvasWidth, height: canvasHeight });
        
        // 更新全局状态
        dispatch({ type: 'SET_DISPLAY_SIZE', payload: { width, height } });
        dispatch({ type: 'SET_CANVAS_SIZE', payload: { width: canvasWidth, height: canvasHeight } });
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [dispatch]);
  
  // 应用自适应参数到Cubism2Model
  useEffect(() => {
    if (cubism2Model && adaptiveParams && state.isAdaptiveEnabled) {
      cubism2Model.updateAdaptiveLayout(
        canvasSize.width,
        canvasSize.height,
        displaySize.width,
        displaySize.height
      );
    }
  }, [cubism2Model, adaptiveParams, canvasSize, displaySize, state.isAdaptiveEnabled]);
  
  return (
    <div 
      ref={containerRef}
      id="waifu-canvas" 
      className="waifu-canvas"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative'
      }}
    >
      <canvas
        id="live2d"
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          bottom: '0',
          left: '0'
        }}
      />
    </div>
  );
};
```

#### 2.2.2 更新样式文件
```css
/* packages/renderer/src/components/Live2D/style.css */
/* 看板娘容器 - 支持动态尺寸 */
#waifu {
  position: fixed;
  bottom: 0;
  left: 0;
  width: var(--waifu-width, 250px);
  height: var(--waifu-height, 250px);
  min-width: 150px;
  min-height: 150px;
  max-width: 500px;
  max-height: 500px;
  z-index: 1;
  font-size: 0;
  transition: all .3s ease-in-out;
  transform: translateY(100%);
  resize: both;
  overflow: hidden;
}

/* 看板娘画布 - 响应式 */
.waifu-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 150px;
  min-height: 150px;
}

/* 自适应调试信息 */
.waifu-adaptive-debug {
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: monospace;
  z-index: 100;
  pointer-events: none;
}
```

### 2.3 配置系统

#### 2.3.1 自适应配置接口
```typescript
// packages/renderer/src/types/adaptive.ts
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
```

#### 2.3.2 默认配置
```typescript
// packages/renderer/src/config/adaptive-defaults.ts
export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  enabled: true,
  
  baseViewSize: 2.0,
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
  
  showDebugInfo: false,
  logAdaptiveChanges: true
};
```

## 3. 实施计划

### 3.1 第一阶段：核心自适应逻辑（1-2天）
1. 扩展Live2DContext状态管理
2. 创建useCanvasAdaptive Hook
3. 实现Cubism2Model的自适应方法
4. 基础测试和调试

### 3.2 第二阶段：组件集成（1天）
1. 更新Live2DCanvas组件
2. 集成ResizeObserver
3. 更新样式文件
4. 测试响应式功能

### 3.3 第三阶段：配置和优化（1天）
1. 实现配置系统
2. 添加性能优化（缓存、防抖）
3. 添加调试工具
4. 完整测试和文档

## 4. 风险评估和缓解

### 4.1 技术风险
- **性能影响**：频繁的矩阵重计算
  - 缓解：实现计算缓存和防抖机制
- **兼容性问题**：与现有功能的冲突
  - 缓解：提供开关选项，保持向后兼容
- **精度问题**：浮点数计算误差
  - 缓解：使用容差比较，添加边界检查

### 4.2 集成风险
- **状态管理复杂性**：新增状态可能导致状态混乱
  - 缓解：严格的状态更新流程，添加状态验证
- **组件重渲染**：频繁的尺寸变化可能导致性能问题
  - 缓解：使用React.memo和useMemo优化
- **用户体验**：过度的自适应可能影响用户体验
  - 缓解：提供平滑过渡动画，允许用户禁用

## 5. 测试策略

### 5.1 单元测试
- 自适应参数计算函数
- 矩阵变换逻辑
- 配置验证

### 5.2 集成测试
- 组件响应式行为
- 状态管理流程
- 性能基准测试

### 5.3 用户测试
- 不同屏幕尺寸测试
- 窗口拖拽调整测试
- 极端宽高比测试

这个设计方案基于对项目现有架构的深度理解，提供了一个渐进式、低风险的实施路径，确保自适应功能能够无缝集成到现有系统中。 