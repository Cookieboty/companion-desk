# 3D虚拟角色功能部署指南

## 📋 功能概述

3D虚拟角色功能已完成基础实现，包含以下核心特性：

### ✅ 已实现功能
- **3D角色渲染系统**: 基于Three.js和React Three Fiber的现代化3D渲染
- **VRM模型支持**: 支持VRM 1.0格式模型，包含回退显示机制
- **模式智能切换**: Live2D与3D模式之间的无缝切换，支持性能自适应
- **MCP协议集成**: 完整的Model Context Protocol实现，支持Cursor IDE集成
- **状态管理系统**: 基于Zustand的轻量化状态管理
- **性能监控**: 实时性能监控和自动质量调整
- **工具生态**: 代码解释、动画演示、语音反馈等MCP工具

### 🛠️ 技术栈
- **Three.js R167+**: 3D渲染引擎
- **@pixiv/three-vrm v3**: VRM模型加载和控制
- **React Three Fiber v8**: React集成的3D渲染框架
- **Zustand**: 状态管理
- **MCP SDK**: Model Context Protocol实现
- **TypeScript**: 类型安全保证

## 🚀 快速开始

### 1. 安装依赖
```bash
# 安装所有依赖
pnpm install

# 或分别安装
cd packages/renderer && pnpm install
cd packages/electron && pnpm install
cd packages/types && pnpm install
```

### 2. 构建项目
```bash
# 构建所有包
pnpm build

# 或分别构建
pnpm -r run build
```

### 3. 运行开发模式
```bash
# 启动开发模式
pnpm dev
```

### 4. 运行生产模式
```bash
# 构建并启动生产版本
pnpm build && pnpm start
```

## 🎮 使用说明

### 模式切换
应用会自动检测WebGL支持：
- **支持WebGL**: 启用3D模式切换功能
- **不支持WebGL**: 仅使用Live2D模式

在3D模式下：
- 右上角显示性能控制面板
- 自动性能监控和质量调整
- 支持手动模式切换

### MCP功能
如果安装了Cursor IDE：
- MCP服务器会自动注册到Cursor配置
- 提供代码解释、动画演示等工具
- 支持实时语音反馈和手势引导

### 3D角色交互
- **表情控制**: 支持多种表情切换
- **动画播放**: 待机、呼吸、互动动画
- **视线跟踪**: 智能视线跟随
- **物理效果**: SpringBone物理模拟

## 🔧 配置选项

### 渲染质量设置
```typescript
// 在character3DStore中配置
setRenderQuality('low' | 'medium' | 'high' | 'ultra');
```

### MCP工具配置
```typescript
// 在VirtualCharacterMCPServer中自定义工具
await mcpServer.registerTool(toolName, toolInstance);
```

### 性能监控设置
```typescript
// 启用/禁用自动性能调整
const { enablePerformanceMode } = useCharacter3DStore();
```

## 📁 项目结构

```
packages/
├── renderer/                    # 前端渲染器
│   ├── src/components/
│   │   ├── VirtualCharacter3D/  # 3D角色组件
│   │   ├── ModeSwitcher/        # 模式切换器
│   │   └── Live2dWidget/        # Live2D组件
│   ├── src/hooks/               # React Hooks
│   ├── src/stores/              # Zustand状态管理
│   └── src/types/               # 类型定义
├── electron/                    # Electron主进程
│   ├── src/mcp/                 # MCP协议实现
│   │   ├── tools/               # MCP工具
│   │   ├── security/            # 安全管理
│   │   └── integration/         # IDE集成
│   └── src/services/            # 核心服务
└── types/                       # 共享类型定义
```

## 🧪 测试

### 运行单元测试
```bash
# Electron包测试
cd packages/electron && npm test

# 渲染器包测试（如果有）
cd packages/renderer && npm test
```

### MCP功能测试
```bash
# 启动MCP服务器测试
node packages/electron/src/mcp-server.js
```

### 性能测试
1. 启动应用
2. 切换到3D模式
3. 观察性能面板中的FPS和内存使用
4. 测试模式自动切换功能

## 🔍 故障排除

### 常见问题

**Q: 3D模式无法启动**
A: 检查WebGL支持，确保显卡驱动更新

**Q: MCP工具无法连接**
A: 确保Cursor IDE已安装且配置文件权限正确

**Q: 性能较差**
A: 启用自动性能调整，或手动降低渲染质量

**Q: 模型加载失败**
A: 检查VRM文件格式，确保符合VRM 1.0规范

### 调试模式
```bash
# 启用详细日志
NODE_ENV=development pnpm dev

# 启用MCP调试
MCP_DEBUG=true pnpm dev
```

## 📈 性能优化建议

### 1. 硬件要求
- **最低**: 支持WebGL的显卡
- **推荐**: 独立显卡，4GB+ 内存
- **最佳**: 现代显卡，8GB+ 内存

### 2. 性能调优
- 启用硬件加速
- 关闭不必要的后台程序
- 使用性能模式的电源设置

### 3. 开发优化
- 使用代码分割减少包大小
- 启用Tree Shaking
- 优化纹理和模型资源

## 🚀 部署到生产环境

### 1. 构建优化
```bash
# 生产构建
NODE_ENV=production pnpm build
```

### 2. 资源优化
- 压缩VRM模型文件
- 优化纹理尺寸
- 启用Gzip压缩

### 3. 安全配置
- 启用MCP安全验证
- 配置CORS策略
- 限制工具权限

## 📞 支持和反馈

如遇到问题或需要技术支持，请：
1. 查看控制台错误日志
2. 检查性能监控数据
3. 提供详细的错误复现步骤

## 🔄 后续开发计划

### 短期目标
- [ ] 添加更多VRM模型支持
- [ ] 完善语音合成集成
- [ ] 优化移动设备性能

### 长期目标
- [ ] 支持自定义动画导入
- [ ] AI驱动的表情生成
- [ ] 云端模型资源库

---

*最后更新: 2025年1月8日*