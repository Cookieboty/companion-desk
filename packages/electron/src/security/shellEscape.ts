/**
 * 拼接 shell 脚本时的参数转义。spawn 不经 shell 的 argv 形式天然安全；
 * 只有 bash -lc / powershell -Command 这种"把代码拼进脚本字符串"的场景才需要。
 */

/** 包成 PowerShell 单引号字符串字面量（单引号双写），可安全嵌入 '...' 上下文。 */
export function psQuote(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** 包成 AppleScript 双引号字符串字面量。 */
export function appleScriptQuote(s: string): string {
  const escaped = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}
