/**
 * 渲染进程侧错误恢复 —— IPC 抛出的错误在 Electron 序列化后会**丢失原型**，
 * 只保留 `message` 字段。本模块负责把这类"贫瘠错误"还原为带 `code` 的
 * `SDKError`，与主进程 [`AIClientError`](file:///../../ai-sdk/src/errors.ts) 语义对齐。
 */

const CODE_PREFIX_RE = /^\[([A-Z_]+)\]\s*(.*)$/;

/**
 * 与 [`ErrorCodes`](file:///../../ai-sdk/src/errors.ts) 保持同名的常量表；
 * 客户端侧独立维护以避免拉入 dsh 依赖。
 */
export const SDKErrorCodes = {
  LIVE2D_NOT_AVAILABLE: 'LIVE2D_NOT_AVAILABLE',
  SEAM_NOT_INJECTED: 'SEAM_NOT_INJECTED',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_CONFIRM_INVALID: 'TOOL_CONFIRM_INVALID',
  PROFILE_INVALID: 'PROFILE_INVALID',
  DISPOSED: 'AICLIENT_DISPOSED',
  IPC_ERROR: 'IPC_ERROR',
  IPC_STREAM_ABORTED: 'IPC_STREAM_ABORTED',
  BRIDGE_MISSING: 'BRIDGE_MISSING',
} as const;

export type SDKErrorCode = (typeof SDKErrorCodes)[keyof typeof SDKErrorCodes];

export class SDKError extends Error {
  readonly code: SDKErrorCode;
  override readonly cause?: unknown;

  constructor(code: SDKErrorCode, message: string, cause?: unknown) {
    super(`[${code}] ${message}`);
    this.name = 'SDKError';
    this.code = code;
    this.cause = cause;
  }

  /**
   * 从 IPC 反序列化后的 Error（原型丢失）还原：
   * - 优先解析 `[CODE] xxx` 前缀；
   * - 无前缀时回落到 `IPC_ERROR`。
   */
  static fromIpc(err: unknown): SDKError {
    if (err instanceof SDKError) return err;
    const raw = err instanceof Error ? err.message : String(err);
    const m = CODE_PREFIX_RE.exec(raw);
    if (m) {
      const code = m[1] ?? '';
      const msg = m[2] ?? raw;
      const known = (SDKErrorCodes as Record<string, SDKErrorCode>)[code];
      if (known) return new SDKError(known, msg, err);
      return new SDKError(SDKErrorCodes.IPC_ERROR, raw, err);
    }
    return new SDKError(SDKErrorCodes.IPC_ERROR, raw, err);
  }
}
