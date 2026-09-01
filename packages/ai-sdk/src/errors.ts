/**
 * AI SDK 错误码 —— 供 UI / IPC 统一识别。
 *
 * 命名规则：`{SUBSYS}_{REASON}`；所有 error 均带 `code` 常量属性，方便断言。
 */

export const ErrorCodes = {
  LIVE2D_NOT_AVAILABLE: 'LIVE2D_NOT_AVAILABLE',
  SEAM_NOT_INJECTED: 'SEAM_NOT_INJECTED',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_CONFIRM_INVALID: 'TOOL_CONFIRM_INVALID',
  PROFILE_INVALID: 'PROFILE_INVALID',
  DISPOSED: 'AICLIENT_DISPOSED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AIClientError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'AIClientError';
    this.code = code;
  }
}
