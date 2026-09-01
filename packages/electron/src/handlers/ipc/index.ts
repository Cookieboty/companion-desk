/**
 * IPC处理器模块统一导出
 */

// 基础类
export { BaseIpcHandler } from './BaseIpcHandler';

// 具体处理器
export { WindowIpcHandler } from './WindowIpcHandler';
export { ConfigIpcHandler } from './ConfigIpcHandler';
export { FileIpcHandler } from './FileIpcHandler';
export { VoiceIpcHandler } from './VoiceIpcHandler';
export { McpIpcHandler } from './McpIpcHandler';

// 注册器
export { IpcRegistry } from './IpcRegistry';
export type { IpcRegistryOptions, IIpcRegistry } from './IpcRegistry';