# `@ig-live/ai-sdk-client/preload` 使用指引

> P7-4 交付物之一：把 [`mkAiPreload`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/preload/mkAiPreload.ts) 模板复制到 Electron 各端 preload，实现渲染进程与主进程 [`@ig-live/ai-runtime`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime) 之间的**白名单 IPC 桥**。

## 目标

- 在 Electron **preload 脚本**里挂载 `window.aiIPC`（或自定义名），供 [`ClientAIClient`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/ClientAIClient.ts) 调用；
- 强制 `ai:` 前缀白名单 + 通道名长度上限（96），防止渲染层通过 preload 发起任意 IPC；
- 与 [`AI_EVENT_CHANNEL`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/channels.ts#L30-L30) / [`IPC_METHODS`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/channels.ts) 保持结构一致。

## 快速上手

### 1. 安装依赖

```jsonc
{
  "dependencies": {
    "@ig-live/ai-sdk-client": "workspace:*",
  },
}
```

### 2. 在 preload 脚本中挂载 bridge

renderer 侧（**Electron preload，CommonJS 或 ESM 皆可**）：

```ts
// packages/renderer/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { mkAiPreload } from '@ig-live/ai-sdk-client/preload';

// 挂到 window.aiIPC（默认）
mkAiPreload({ contextBridge, ipcRenderer });
```

ai-chat 侧（多窗口场景，可以使用不同 bridgeName 避免冲突）：

```ts
// packages/ai-chat/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { mkAiPreload } from '@ig-live/ai-sdk-client/preload';

mkAiPreload({
  contextBridge,
  ipcRenderer,
  bridgeName: 'aiChatIPC', // window.aiChatIPC
});
```

> ⚠️ 出于 [contextIsolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) 与 CSP 考量，preload 必须启用 `contextIsolation: true` 与 `sandbox: true`；`mkAiPreload` 会自动通过 `contextBridge.exposeInMainWorld` 挂载 API。

### 3. 在渲染进程消费

```tsx
// packages/renderer/src/App.tsx
import { AIProvider } from '@ig-live/ai-sdk-client/react';

export function App() {
  return (
    // 未传 bridge，将从 window.aiIPC 读取
    <AIProvider>
      <Chat />
    </AIProvider>
  );
}
```

若使用了自定义 bridgeName：

```tsx
<AIProvider bridgeName="aiChatIPC">
  <Chat />
</AIProvider>
```

或注入外部 client：

```tsx
import { ClientAIClient } from '@ig-live/ai-sdk-client';
const client = new ClientAIClient({ bridgeName: 'aiChatIPC' });
<AIProvider client={client}>...</AIProvider>;
```

## 通道白名单契约

`mkAiPreload` 会用 [`assertChannel`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/preload/mkAiPreload.ts#L25-L40) 校验每次 `invoke` / `on` / `off` 的 channel，规则：

| 规则   | 说明                                                      |
| ------ | --------------------------------------------------------- |
| 前缀   | 必须以 `ai:` 开头                                         |
| 长度   | ≤ `AI_CHANNEL_MAX_LEN`（96 字节）                         |
| 字符集 | 只允许 ASCII `[A-Za-z0-9_:-]`                             |
| 违反时 | 立刻抛错并把非法 channel 名回显到 message，方便定位调用栈 |

对应的 runtime 侧白名单：[`packages/ai-runtime/src/channels.ts`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/channels.ts)；两侧的 [`channels.snapshot.test.ts`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/tests/channels.snapshot.test.ts) 会做结构一致性断言。

## API 参考

### `mkAiPreload(options)`

| 参数            | 类型                       | 说明                               |
| --------------- | -------------------------- | ---------------------------------- |
| `contextBridge` | `PreloadContextBridgeLike` | 通常传 electron 的 `contextBridge` |
| `ipcRenderer`   | `PreloadIpcRendererLike`   | 通常传 electron 的 `ipcRenderer`   |
| `bridgeName`    | `string`（可选）           | 挂到 window 上的 key，默认 `aiIPC` |

返回被暴露的对象引用（供测试断言），包含 `invoke / on / off` 三个方法。

### 事件监听

`ipcRenderer.on` 的原始回调形如 `(event, ...args)`；`mkAiPreload` 会**剥掉第一个 IpcRendererEvent 参数**，把 `args[0]` 传给业务侧：

```ts
window.aiIPC.on('ai:event', (payload) => {
  // payload = { evt, data }
});
```

订阅 `ai:event` 单一入口对应 [`AI_EVENT_CHANNEL`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/channels.ts#L30-L30)，具体业务事件（`agent:step` / `tts:chunk` / `userProfile:changed` …）由 [`ClientAIClient.dispatch`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/ClientAIClient.ts#L126-L137) 二次分发。

## 常见问题

**Q: 直接 `import 'electron'` 会不会污染 renderer bundle？**
A: 不会。`mkAiPreload` 只声明 `PreloadIpcRendererLike / PreloadContextBridgeLike` 接口，实际 `electron` 由 preload 侧显式传入；[tsup.config.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/tsup.config.ts) 也已把 `electron` 列入 external。

**Q: 如何在多个 BrowserWindow 里共享同一 AIRuntime？**
A: 主进程只需 `startAiRuntime()` 一次，所有 preload 都可以 `mkAiPreload`；`ai:event` 会被 [`EventBroadcaster`](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/EventBroadcaster.ts) 广播到全部 `WebContents`。

**Q: 通道名写错了怎么办？**
A: `assertChannel` 会抛 `Error: [ai-preload] channel 'xxx' 缺少前缀 'ai:'`；ClientAIClient 端如果调用不存在的方法会返回 `undefined`，调用即 `TypeError`，帮你在联调阶段快速发现。

## 引用

- 计划文档：[P7-ai-sdk-client.md §P7-4](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P7-ai-sdk-client.md#L63-L76)
- 源码：[mkAiPreload.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/preload/mkAiPreload.ts)
- 测试：[mkAiPreload.test.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/tests/mkAiPreload.test.ts)
- 通道白名单：[channels.ts (client)](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/channels.ts) / [channels.ts (runtime)](file:///Users/botycookie/self/ai-live2d-client/packages/ai-runtime/src/channels.ts)
