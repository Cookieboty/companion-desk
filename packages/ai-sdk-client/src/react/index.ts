/**
 * `@ig-live/ai-sdk-client/react` —— React 子入口。
 *
 * 只在被显式 import 时才会拉入 React 依赖；`ClientAIClient` 与 preload 层
 * 都不会通过这里透传 React 依赖，符合 P7 计划 §P7-1 的 tsup 拆分要求。
 */

export * from './AIProvider';
export * from './useChat';
export * from './useAgent';
export * from './useAIEvents';
export * from './useTTSLipSync';
export * from './useUserProfile';
