/**
 * `@ig-live/ai-sdk-client/preload` —— preload 层子入口。
 *
 * 主要导出 [`mkAiPreload`](file:///./mkAiPreload.ts) 与 [`assertChannel`](file:///./mkAiPreload.ts)；
 * 该子入口预期在 Electron preload 脚本里被 `import`（Node/Electron 环境），
 * 因此 **不** 依赖任何 React / DOM API。
 */

export * from './mkAiPreload';
