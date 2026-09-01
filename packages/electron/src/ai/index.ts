/**
 * `packages/electron/src/ai` —— AI runtime 装配层
 *
 * 该目录只做**适配**：把 Electron 侧的能力（safeStorage / clipboard / desktopCapturer）
 * 装成 `@ig-live/bundle-ig-electron-caps` 定义的 seam 接口，然后交给
 * [`AIRuntimeBoot`](file:///./AIRuntimeBoot.ts) 注入到 `@ig-live/ai-runtime`。
 *
 * 不写业务逻辑；业务逻辑住在 `@ig-live/bundle-ig-*` 系列包内。
 */

export * from './AIRuntimeBoot';
export * from './SafeKeyProvider';
export * from './ClipboardGateway';
export * from './ScreenCapture';
