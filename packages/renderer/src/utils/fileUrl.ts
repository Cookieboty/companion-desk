/**
 * 把本地文件路径转换成可在渲染进程中加载的 file:// URL。
 *
 * 直接拼 `file://${path}` 在 Windows 上会得到 `file://C:\Users\...`，
 * Chromium 会把 `C:` 当成主机名而加载失败；这里统一处理：
 * - 已经是 URL（http/https/file/data/blob）时原样返回；
 * - 反斜杠转为正斜杠；
 * - 盘符路径 `C:/x` → `file:///C:/x`，UNC `//server/share` → `file://server/share`；
 * - 对空格、`#`、`?`、`%` 等做转义；
 * - 相对路径原样返回（由页面 URL 解析）。
 */
export function toFileUrl(filePath: string): string {
  if (/^(https?|file|data|blob):/i.test(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  const encode = (p: string): string => encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${encode(normalized)}`;
  if (normalized.startsWith('//')) return `file:${encode(normalized)}`;
  if (normalized.startsWith('/')) return `file://${encode(normalized)}`;
  return filePath;
}
