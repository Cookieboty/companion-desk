# P7 · L3 · ai-sdk-client 渲染进程薄客户端

## 元数据

| 项 | 值 |
|---|---|
| 层级 | L3（渲染进程薄层） |
| 依赖 Plan | [P5](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P5-ai-sdk-facade.md) + [P6](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P6-ai-runtime.md) |
| 建议 Sprint | Sprint 4（1 周） |
| 预估工作量 | 4~5 人日 |
| 关联设计章节 | [§3.3](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L557-L581) / [§14 P7](file:///Users/botycookie/self/ai-live2d-client/docs/AI_HARNESS_DESIGN.md#L1820-L1833) |

## 目标

一句话：**渲染进程 `import { AIProvider, useChat } from '@ig-live/ai-sdk-client'` 就能收发消息、订阅事件、读写偏好，零业务代码。**

## 准入前提

- [P5](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P5-ai-sdk-facade.md) 完成（AIClient 签名稳定）
- [P6](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P6-ai-runtime.md) 完成（IPC 通道就绪）

## 范围

**包含**：ClientAIClient（IPC Proxy）、AIProvider、5 个 React Hook、preload 模板、Storybook。

**不包含**：主进程运行时（→ P6）；具体 UI 组件（→ P8）。

## 任务清单

### P7-1 · 包骨架

- 目录 [packages/ai-sdk-client](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client)
- `peerDependencies: react @ig-live/ai-sdk`
- tsup 仅 ESM；`"exports"` 拆 `./preload` 与 `./react`（避免主进程/preload 引入 React）
- 验收：`pnpm build` 产出

### P7-2 · ClientAIClient（IPC Proxy）

- 新建 [src/ClientAIClient.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/ClientAIClient.ts)
- **与 [P5 AIClient](file:///Users/botycookie/self/ai-live2d-client/docs/plans/P5-ai-sdk-facade.md#p5-3-aiclient-门面) 完全相同的类型签名**（用 `import type`）
- 每个 Facade 通过 Proxy 反射 → `window.aiIPC.invoke(`ai:${facade}:${method}`, ...args)`
- 流式方法：`invoke` 返回 `AsyncIterable`；内部订阅 `ai:${facade}:${method}:chunk` + `reqId`
- 事件订阅：单一入口 `ai:event`，客户端做本地 pub/sub 二次分发
- 错误：把 IPC 抛出的原型丢失的 Error 还原成命名错误（`SDKError.fromIpc(err)`）
- 单测：mock `window.aiIPC`，断言每个方法映射到正确通道

### P7-3 · AIProvider + React Hooks

- 新建 [src/react/AIProvider.tsx](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/AIProvider.tsx)：
  - Context 承载 ClientAIClient 单例
  - 生命周期：unmount 时 unsubscribe 全部事件
- 新建 5 个 Hook（每个一文件）：
  | Hook | 文件 | 用途 |
  |---|---|---|
  | `useChat` | [useChat.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useChat.ts) | messages / sendMessage / streaming / abort / regenerate |
  | `useAgent` | [useAgent.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useAgent.ts) | agent 步骤流 / confirm 危险工具 |
  | `useAIEvents` | [useAIEvents.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useAIEvents.ts) | 订阅任意 AIClientEvent |
  | `useTTSLipSync` | [useTTSLipSync.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useTTSLipSync.ts) | 订阅 `tts:chunk` → `useSyncExternalStore` 输出 rms |
  | `useUserProfile` | [useUserProfile.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/react/useUserProfile.ts) | get/set/subscribe UserProfile |
- 全部 Hook 用 React 19 的 `useSyncExternalStore` + `use()` 兼容 Suspense
- 单测：`@testing-library/react`

### P7-4 · preload 模板

- 新建 [src/preload/mkAiPreload.ts](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client/src/preload/mkAiPreload.ts)：
  ```ts
  export function mkAiPreload(bridgeName = 'aiIPC') {
    contextBridge.exposeInMainWorld(bridgeName, {
      invoke: (ch, ...args) => ipcRenderer.invoke(assertChannel(ch), ...args),
      on:     (ch, fn)      => { ipcRenderer.on(assertChannel(ch), fn); return () => ipcRenderer.off(ch, fn); },
    });
  }
  ```
- `assertChannel`：白名单前缀 `ai:` + 长度限制
- 使用文档：[docs/preload-usage.md](file:///Users/botycookie/self/ai-live2d-client/docs/preload-usage.md)
- 验收：把模板复制到 [renderer preload](file:///Users/botycookie/self/ai-live2d-client/packages/renderer) 与 [ai-chat preload](file:///Users/botycookie/self/ai-live2d-client/packages/ai-chat) 分别可用

### P7-5 · Storybook / example 应用

- 新建 [examples/ai-sdk-client-demo](file:///Users/botycookie/self/ai-live2d-client/examples/ai-sdk-client-demo)：一个最小的 vite + electron demo
- 展示每个 hook 的最小用法
- CI 起 electron 跑 smoke（可选）

## 交付物

- 1 个可发布 npm 包 [@ig-live/ai-sdk-client](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk-client)
- 5 个 React Hook + AIProvider + preload 模板 + example

## 退出准则（自动化）

1. `pnpm --filter @ig-live/ai-sdk-client build test lint typecheck` 全绿
2. Example 应用点击 send 能实时收到 chunks
3. `useUserProfile` 修改后组件 rerender
4. 类型签名与 P5 AIClient 完全一致（tsc 结构等价断言）

## 测试策略

- 单元：hooks 用 `@testing-library/react` + mock ClientAIClient
- 契约：`ClientAIClient` 与 `AIClient` 结构等价（类型测试）
- 集成：Example 应用手工目视

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| React 19 API 尚未稳定 | 用 `useSyncExternalStore` 兜底；Suspense 部分放开关 |
| Proxy 反射类型丢失 | ts-morph 生成 `client.d.ts`；避免 `any` 泄漏 |
| preload 被绕过导致安全问题 | 白名单前缀 + contextIsolation: true |
