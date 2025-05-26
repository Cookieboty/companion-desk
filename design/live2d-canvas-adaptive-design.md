# Live2D模型Canvas自适应设计方案

## 1. 问题分析

### 1.1 当前问题
- 模型在不同Canvas尺寸下可能出现截断问题
- 缺乏根据Canvas宽高进行自适应的机制
- 模型布局固定，无法根据容器尺寸动态调整

### 1.2 官方Demo分析
根据Live2D官方TypeScript示例 (https://github.com/Live2D/CubismWebSamples/tree/develop/Samples/TypeScript)，关键实现要点：

1. **视图矩阵设置**：根据Canvas宽高比计算合适的视图范围
2. **投影矩阵调整**：确保模型在不同宽高比下正确显示
3. **模型矩阵缩放**：根据Canvas尺寸自动调整模型大小
4. **布局参数适配**：动态计算模型在Canvas中的位置和尺寸

## 2. 设计方案

### 2.1 核心改进点

#### 2.1.1 动态视图矩阵计算
```typescript
// 当前实现（固定比例）
const ratio = height / width;
const left = LAppDefine.VIEW_LOGICAL_LEFT;
const right = LAppDefine.VIEW_LOGICAL_RIGHT;
const bottom = -ratio;
const top = ratio;

// 改进方案（自适应比例）
const aspectRatio = width / height;
let viewLeft, viewRight, viewBottom, viewTop;

if (aspectRatio > 1) {
  // 宽屏：扩展水平视野
  viewLeft = -aspectRatio;
  viewRight = aspectRatio;
  viewBottom = -1;
  viewTop = 1;
} else {
  // 竖屏：扩展垂直视野
  viewLeft = -1;
  viewRight = 1;
  viewBottom = -1 / aspectRatio;
  viewTop = 1 / aspectRatio;
}
```

#### 2.1.2 智能模型缩放
```typescript
// 根据Canvas尺寸和模型原始尺寸计算最佳缩放比例
const calculateOptimalScale = (canvasWidth: number, canvasHeight: number, modelWidth: number, modelHeight: number) => {
  const canvasAspect = canvasWidth / canvasHeight;
  const modelAspect = modelWidth / modelHeight;
  
  let scale: number;
  if (canvasAspect > modelAspect) {
    // Canvas更宽，以高度为准
    scale = canvasHeight / modelHeight;
  } else {
    // Canvas更高，以宽度为准
    scale = canvasWidth / modelWidth;
  }
  
  // 添加边距，避免模型贴边
  return scale * 0.9;
};
```

#### 2.1.3 动态布局调整
```typescript
// 根据Canvas尺寸动态调整模型布局
const adjustModelLayout = (modelMatrix: L2DModelMatrix, canvasWidth: number, canvasHeight: number) => {
  const aspectRatio = canvasWidth / canvasHeight;
  
  // 根据宽高比调整模型位置
  if (aspectRatio > 1.5) {
    // 超宽屏：模型稍微偏右
    modelMatrix.setCenterPosition(0.1, 0);
  } else if (aspectRatio < 0.7) {
    // 超高屏：模型稍微上移
    modelMatrix.setCenterPosition(0, 0.1);
  } else {
    // 标准比例：居中
    modelMatrix.setCenterPosition(0, 0);
  }
};
```

### 2.2 实现架构

#### 2.2.1 新增适配器类
```typescript
export class Live2DCanvasAdapter {
  private canvas: HTMLCanvasElement;
  private modelMatrix: L2DModelMatrix;
  private viewMatrix: L2DViewMatrix;
  private projMatrix: L2DMatrix44;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  
  // 计算自适应参数
  calculateAdaptiveParams(): AdaptiveParams {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const aspectRatio = width / height;
    
    return {
      viewBounds: this.calculateViewBounds(aspectRatio),
      modelScale: this.calculateModelScale(width, height),
      modelPosition: this.calculateModelPosition(aspectRatio)
    };
  }
  
  // 应用自适应设置
  applyAdaptiveSettings(params: AdaptiveParams): void {
    this.updateViewMatrix(params.viewBounds);
    this.updateProjectionMatrix();
    this.updateModelMatrix(params.modelScale, params.modelPosition);
  }
}
```

#### 2.2.2 响应式更新机制
```typescript
export class ResponsiveManager {
  private resizeObserver: ResizeObserver;
  private adapter: Live2DCanvasAdapter;
  
  constructor(canvas: HTMLCanvasElement, adapter: Live2DCanvasAdapter) {
    this.adapter = adapter;
    this.setupResizeObserver(canvas);
  }
  
  private setupResizeObserver(canvas: HTMLCanvasElement): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.handleCanvasResize(entry.contentRect);
      }
    });
    
    this.resizeObserver.observe(canvas);
  }
  
  private handleCanvasResize(rect: DOMRectReadOnly): void {
    // 更新Canvas尺寸
    this.updateCanvasSize(rect.width, rect.height);
    
    // 重新计算自适应参数
    const params = this.adapter.calculateAdaptiveParams();
    
    // 应用新的设置
    this.adapter.applyAdaptiveSettings(params);
  }
}
```

### 2.3 配置选项

#### 2.3.1 自适应配置接口
```typescript
interface AdaptiveConfig {
  // 是否启用自适应
  enabled: boolean;
  
  // 最小/最大缩放比例
  minScale: number;
  maxScale: number;
  
  // 边距设置
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  
  // 不同宽高比下的特殊处理
  aspectRatioRules: {
    ultraWide: { threshold: number; offsetX: number; offsetY: number; };
    wide: { threshold: number; offsetX: number; offsetY: number; };
    square: { threshold: number; offsetX: number; offsetY: number; };
    tall: { threshold: number; offsetX: number; offsetY: number; };
    ultraTall: { threshold: number; offsetX: number; offsetY: number; };
  };
  
  // 动画过渡设置
  transition: {
    enabled: boolean;
    duration: number;
    easing: string;
  };
}
```

## 3. 实施步骤

### 3.1 第一阶段：核心适配逻辑
1. 创建`Live2DCanvasAdapter`类
2. 实现动态视图矩阵计算
3. 实现智能模型缩放算法
4. 集成到现有的`Cubism2Model`类中

### 3.2 第二阶段：响应式机制
1. 创建`ResponsiveManager`类
2. 实现ResizeObserver监听
3. 添加防抖机制避免频繁重计算
4. 实现平滑过渡动画

### 3.3 第三阶段：配置和优化
1. 添加自适应配置选项
2. 实现不同设备的预设配置
3. 添加性能优化措施
4. 完善错误处理和降级方案

## 4. 技术细节

### 4.1 关键算法

#### 4.1.1 视图边界计算
```typescript
private calculateViewBounds(aspectRatio: number): ViewBounds {
  const baseSize = 2.0; // 基础视图大小
  
  if (aspectRatio > 1) {
    // 横屏
    return {
      left: -baseSize * aspectRatio,
      right: baseSize * aspectRatio,
      bottom: -baseSize,
      top: baseSize
    };
  } else {
    // 竖屏
    return {
      left: -baseSize,
      right: baseSize,
      bottom: -baseSize / aspectRatio,
      top: baseSize / aspectRatio
    };
  }
}
```

#### 4.1.2 模型适配算法
```typescript
private calculateModelFitScale(canvasWidth: number, canvasHeight: number, modelBounds: ModelBounds): number {
  const canvasAspect = canvasWidth / canvasHeight;
  const modelAspect = modelBounds.width / modelBounds.height;
  
  let fitScale: number;
  
  if (canvasAspect > modelAspect) {
    // Canvas比模型更宽，以高度适配
    fitScale = canvasHeight / modelBounds.height;
  } else {
    // Canvas比模型更高，以宽度适配
    fitScale = canvasWidth / modelBounds.width;
  }
  
  // 应用安全边距
  return fitScale * this.config.safetyMargin;
}
```

### 4.2 性能优化

#### 4.2.1 计算缓存
```typescript
class AdaptiveCache {
  private cache = new Map<string, AdaptiveParams>();
  
  getCachedParams(width: number, height: number): AdaptiveParams | null {
    const key = `${width}x${height}`;
    return this.cache.get(key) || null;
  }
  
  setCachedParams(width: number, height: number, params: AdaptiveParams): void {
    const key = `${width}x${height}`;
    this.cache.set(key, params);
    
    // 限制缓存大小
    if (this.cache.size > 50) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}
```

#### 4.2.2 防抖处理
```typescript
class DebounceManager {
  private timeoutId: number | null = null;
  
  debounce(func: Function, delay: number): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    this.timeoutId = window.setTimeout(() => {
      func();
      this.timeoutId = null;
    }, delay);
  }
}
```

## 5. 测试方案

### 5.1 测试用例
1. **不同宽高比测试**：16:9, 4:3, 1:1, 9:16等
2. **极端尺寸测试**：超宽屏(21:9)、超窄屏(1:3)
3. **动态调整测试**：窗口拖拽调整大小
4. **性能测试**：频繁调整大小的性能表现
5. **兼容性测试**：不同浏览器和设备

### 5.2 验收标准
1. 模型在任何Canvas尺寸下都不会被截断
2. 模型始终保持合适的大小和位置
3. 调整过程流畅，无明显卡顿
4. 内存使用稳定，无泄漏
5. 兼容现有的所有功能

## 6. 风险评估

### 6.1 技术风险
- **性能影响**：频繁的矩阵计算可能影响渲染性能
- **兼容性问题**：新的计算逻辑可能与现有功能冲突
- **精度问题**：浮点数计算可能导致微小的显示偏差

### 6.2 缓解措施
- 实现计算缓存和防抖机制
- 保持向后兼容，提供开关选项
- 使用高精度数学库，添加容错处理

## 7. 后续扩展

### 7.1 高级功能
1. **智能裁剪**：根据Canvas尺寸智能裁剪模型显示区域
2. **多模型适配**：支持多个模型在同一Canvas中的自适应布局
3. **动态LOD**：根据显示尺寸调整模型细节级别
4. **预设模板**：为常见设备提供优化的显示预设

### 7.2 集成扩展
1. **React组件封装**：提供开箱即用的React组件
2. **配置界面**：可视化的自适应参数调整界面
3. **调试工具**：实时显示适配参数和性能指标
4. **云端配置**：支持从云端加载设备特定的优化配置 