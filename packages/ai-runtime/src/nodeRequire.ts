/**
 * nodeRequire —— 获取一个可用的 CommonJS `require`。
 *
 * 之前的写法 `(0, eval)('require')` 依赖全局 `require`：在 Node REPL 中存在，
 * 但在 CJS 模块（`require` 是模块作用域变量）与 ESM 中都不存在，
 * 导致在真实 Electron 主进程里抛出 "require is not defined"，AI runtime 无法启动。
 * 改用 `createRequire`，与 DshBooter 的做法一致；Electron 会为任意 require 实例解析 `electron`。
 */
import { createRequire } from 'node:module';

export function nodeRequire(): NodeJS.Require {
  return createRequire(typeof __filename !== 'undefined' ? __filename : process.cwd() + '/');
}
