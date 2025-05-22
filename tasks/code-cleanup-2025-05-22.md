# 代码清理和项目结构优化

## 问题描述

在完成React重构后，项目中仍保留了许多旧的实现文件，导致项目结构混乱、逻辑重复，并可能引起潜在的维护问题。

## 清理内容

### 1. 删除冗余文件

以下不再需要的文件已被删除：

- `packages/renderer/src/utils/waifu-tips.ts` - 仅导出旧的initWidget函数
- `packages/renderer/src/utils/widget.ts` - 包含旧的初始化逻辑
- `packages/renderer/src/utils/tools.ts` - 旧的工具定义，已由React组件替代

### 2. 更新导出

- 修改 `packages/renderer/src/utils/index.ts`，移除对已删除文件的导出
- 添加对以下模块的直接导出:
  - `live2d-utils.ts`
  - `cache.ts`

## 项目结构优化

### 重构后的文件组织

重构后的项目结构更加清晰，功能划分更合理：

1. **组件目录结构**:
   - `Live2D/` - 主组件目录
   - `Live2D/index.tsx` - 主要组件入口
   - `Live2D/ToolBar.tsx` - 工具栏组件
   - `Live2D/MessageBubble.tsx` - 消息气泡组件
   - `Live2D/Live2DCanvas.tsx` - 画布组件
   - `Live2D/LoadingIndicator.tsx` - 加载指示器组件
   - `Live2D/style.css` - 组件样式

2. **工具函数组织**:
   - `utils/cache.ts` - 缓存工具
   - `utils/drag.ts` - 窗口拖拽功能
   - `utils/icons.ts` - SVG图标定义
   - `utils/live2d-utils.ts` - Live2D相关工具函数
   - `utils/logger.ts` - 日志工具
   - `utils/message.ts` - 消息显示功能
   - `utils/model.ts` - 模型管理
   - `utils/utils.ts` - 通用工具

## 下一步工作

1. 完善React组件的类型定义
2. 优化核心功能与组件之间的交互
3. 解决剩余的类型错误和警告 