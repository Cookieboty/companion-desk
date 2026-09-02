/**
 * @ig-live/ai-sdk-client · 主入口
 *
 * 渲染进程薄客户端（P7 · L3）——把主进程 `@ig-live/ai-runtime` 暴露的 `ai:*` IPC
 * 通道封装为与 [P5 AIClient](file:///../../ai-sdk/src/AIClient.ts) 类型签名完全一致
 * 的 [`ClientAIClient`](file:///./ClientAIClient.ts)，让 UI/CLI 侧感知不到 IPC。
 *
 * 子入口：
 * - `@ig-live/ai-sdk-client` —— `ClientAIClient` + `IPCBridge` 类型（浏览器可用）
 * - `@ig-live/ai-sdk-client/react` —— `AIProvider` + 5 个 React Hook
 * - `@ig-live/ai-sdk-client/preload` —— `mkAiPreload` + `assertChannel` 白名单
 */

export * from './ClientAIClient';
export * from './IPCBridge';
export * from './channels';
export * from './errors';
export * from './errorHint';
