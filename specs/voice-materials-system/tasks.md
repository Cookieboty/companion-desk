# 实施计划

## 阶段1: 基础设施搭建

- [ ] 1. 创建语音素材目录结构
  - 在 `packages/renderer/public/assets/voice/` 下创建分类目录
  - 准备初始的语音素材文件（5-10个不同风格的MP3文件）
  - 创建语音配置文件模板
  - _需求: 需求1.2, 需求2.1_

- [ ] 2. 实现VoiceLibrary核心类
  - 创建 `packages/electron/src/services/VoiceLibrary.ts`
  - 实现语音文件扫描和加载功能
  - 实现文件验证和分类逻辑
  - 添加错误处理和日志记录
  - _需求: 需求2.1, 需求2.3_

- [ ] 3. 实现AudioPlayer播放器
  - 创建 `packages/electron/src/services/AudioPlayer.ts`
  - 支持多平台音频播放（macOS, Windows, Linux）
  - 实现异步播放和错误处理
  - 添加文件格式支持检测
  - _需求: 需求1.1, 需求1.4_

## 阶段2: 语音选择和管理

- [ ] 4. 实现VoiceSelector选择策略
  - 创建 `packages/electron/src/services/VoiceSelector.ts`
  - 实现基于urgency的选择逻辑
  - 实现随机选择和权重算法
  - 支持用户偏好选择
  - _需求: 需求1.3, 需求1.5_

- [ ] 5. 实现TTSEngine引擎
  - 创建 `packages/electron/src/services/TTSEngine.ts`
  - 支持多平台TTS（macOS say, Windows SAPI, Linux espeak）
  - 实现语音参数配置（速度、音调、音量）
  - 添加语音生成和播放功能
  - _需求: 需求4.1, 需求4.2, 需求4.3_

- [ ] 6. 实现ProjectAnalyzer项目分析器
  - 创建 `packages/electron/src/services/ProjectAnalyzer.ts`
  - 实现文件修改检测和统计
  - 分析最近的代码改动类型
  - 提取TODO/任务信息
  - 生成简洁的项目总结文本
  - _需求: 需求5.1, 需求5.2, 需求5.4_

- [ ] 7. 实现VoiceMaterialsManager核心管理器
  - 创建 `packages/electron/src/services/VoiceMaterialsManager.ts`
  - 整合所有组件，提供统一接口
  - 实现语音模式切换（fixed/tts/mixed）
  - 添加项目总结语音播放
  - 实现配置管理和热重载
  - _需求: 需求1.1, 需求2.2, 需求4.4, 需求5.3_

- [ ] 8. 集成到MCP服务器
  - 修改 `packages/electron/src/standalone-mcp-server.ts`
  - 替换现有的TTS逻辑为新的语音素材系统
  - 添加project_summary_voice和switch_voice_mode工具
  - 扩展conversation_complete工具参数
  - 实现项目总结自动播放功能
  - _需求: 需求1.1, 需求1.4, 需求4.4, 需求5.3_

## 阶段3: 配置和用户界面

- [ ] 9. 准备多样化语音素材
  - 录制或收集不同情绪的完成语音
  - 按category分类整理（normal, high, low）
  - 测试所有语音文件的播放效果
  - 创建语音素材配置文件
  - _需求: 需求1.2, 需求1.3_

- [ ] 10. 实现语音配置界面（可选）
  - 在现有设置面板中添加语音选项
  - 支持语音模式切换（fixed/tts/mixed）
  - 实现TTS参数配置（语音、速度、音调）
  - 添加项目总结功能开关
  - 支持语音风格选择和预览
  - _需求: 需求3.1, 需求3.2, 需求3.3, 需求4.1, 需求5.5_

## 阶段4: 测试和优化

- [ ] 11. 单元测试和集成测试
  - 为所有核心类编写单元测试
  - 测试TTS引擎在不同平台的兼容性
  - 测试项目分析器的准确性
  - 验证语音模式切换功能
  - 测试MCP工具的端到端调用
  - 验证错误处理和fallback机制
  - _需求: 需求1.4, 需求2.3, 需求4.3, 需求5.4_

- [ ] 12. 用户测试和调优
  - 测试不同urgency级别的语音效果
  - 验证TTS和固定语音的切换体验
  - 测试项目总结的准确性和有用性
  - 验证随机选择的多样性和用户体验
  - 收集反馈并调整语音素材和选择策略
  - 文档编写和部署准备
  - _需求: 需求1.1, 需求1.5, 需求4.4, 需求5.5_

## 快速启动 (MVP)

如果需要快速验证核心功能，可以先实施以下最小可行方案：

- [ ] 13. MVP实现（2-3小时）
  - 直接在现有MCP服务器中添加语音文件数组和TTS逻辑
  - 实现简单的fixed/tts模式切换
  - 准备3-5个基础语音文件
  - 添加基础项目文件统计功能
  - 实现简单的项目总结TTS播放
  - 测试基本播放和模式切换功能
  - _需求: 需求1.1, 需求1.2, 需求4.1, 需求5.1_