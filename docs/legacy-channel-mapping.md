# Legacy IPC Channel Mapping

**弃用节奏**：保留 2 个次版本（v0.1、v0.2）；v0.3 起移除。

调用旧通道会：

- 打印 `[deprecated] <channel> — 请迁移到 @ig-live/ai-sdk-client` warning；
- 计数器 +1，可通过 `AiChatCompat.stats()` 读取，供 telemetry 上报；
- 转发到新 [AIClient](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/AIClient.ts) 的对应 Facade。

## 通道对照表

| 旧通道 (`ai-chat:*`)           | 新入口                                                                                                                                 | 备注                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ai-chat:message:send`         | [`AIClient.chat.sendMessage`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/ChatFacade.ts#L37-L42)         | 入参 `{ message, modelId }` → `{ provider: modelId, messages: [{role:'user',content:message}] }` |
| `ai-chat:message:stream`       | [`AIClient.chat.stream`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/ChatFacade.ts#L37-L42)              | 兼容旧的 `ai-chat:message:chunk` 事件通道（每次 chunk 是字符串，空字符串表示结束）               |
| `ai-chat:message:getHistory`   | [`AIClient.sessions.list`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/SessionFacade.ts#L16-L23)         | 返回 `Session[]`                                                                                 |
| `ai-chat:message:clearHistory` | 遍历 `sessions.list` + `sessions.delete`                                                                                               | 返回 `{ ok: true }`                                                                              |
| `ai-chat:config:get`           | [`AIClient.memory.userProfile.get`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/MemoryFacade.ts#L21-L28) | 结构为 `{ profile: UserProfile }`                                                                |
| `ai-chat:config:update`        | [`AIClient.memory.userProfile.set`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/facade/MemoryFacade.ts#L21-L28) | 入参透传为 `patch`                                                                               |
| `ai-chat:model:getAvailable`   | 返回 `{ models: [] }`（provider 列表由 dsh 内部管理）                                                                                  | P8 前保持空占位                                                                                  |

## 迁移建议

优先切换到新 IPC 通道 `ai:<facade>:<method>`（详见 [IPC_METHODS](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/channels.ts)），保留原有 UI 逻辑不动，只替换 preload 里的 `invoke` 调用。
