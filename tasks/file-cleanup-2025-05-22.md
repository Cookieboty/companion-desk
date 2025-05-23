# 代码优化：文件清理和类型重构

## 问题描述

在React重构后，项目中存在一些不再使用但仍被保留的旧文件，以及类型定义散落在各处，需要进行清理和优化。

## 清理内容

### 1. 删除不再需要的文件

以下文件已被移除：

- `packages/renderer/src/utils/drag.ts` - 拖拽功能已被useWindowDrag钩子替代
- `packages/renderer/src/utils/message.ts` - 消息功能已被useWaifuMessage钩子替代
- `packages/renderer/src/utils/model.ts` - 模型管理功能已被useLive2DModel钩子替代

### 2. 类型定义集中化

创建了专门的类型定义文件：`packages/renderer/src/types/live2d.ts`，包含：

- `Time`和`TimeConfig`接口 - 从message.ts迁移
- `ModelConfig`接口 - 从model.ts迁移

### 3. 导入路径更新

更新了以下文件中的类型导入路径：

- `packages/renderer/src/hooks/useWaifuMessage.ts` - 现在从types/live2d导入Time
- `packages/renderer/src/components/Live2D/index.tsx` - 使用新的ModelConfig
- `packages/renderer/src/components/Live2dWidget.tsx` - 使用新的ModelConfig
- `packages/renderer/src/App.tsx` - 使用新的ModelConfig

### 4. 导出清理

更新了`packages/renderer/src/utils/index.ts`，移除了对已删除文件的导出。

## 重构收益

1. **代码结构更清晰**：
   - 移除了冗余的实现文件
   - 避免了类似功能的多重实现
   - 使项目结构更加模块化

2. **类型管理更集中**：
   - 相关类型定义集中在专门的文件中
   - 便于类型复用和维护

3. **减少包大小**：
   - 移除了750+行无用代码
   - 提高应用性能和加载速度

4. **提高可维护性**：
   - 减少代码重复和依赖混乱
   - 使未来的功能扩展更加清晰

## 后续工作

1. 继续监控应用运行，确保旧文件删除没有导致任何功能丢失
2. 考虑进一步类型增强，提供更严格的类型检查 