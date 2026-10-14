/**
 * 看板娘气泡文本的唯一出口。
 *
 * 安全约定：气泡**只渲染纯文本**（React 文本节点 / textContent），永不走 innerHTML。
 * 任何来源（AI 回复、提示语、工具结果、摘要、外部 API）进来的字符串都按字面显示，
 * 其中的 `<script>` / `<img onerror>` 等只是普通字符。本函数只做“显示层”清理：
 * 去掉控制字符 / 双向覆盖字符（防止视觉欺骗），合并空白，按字符截断。
 */
const MAX_LEN = 400;
// C0/C1 控制字符（保留 \n）、零宽与双向覆盖字符
const STRIP =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function toBubbleText(input: unknown, max = MAX_LEN): string {
  if (input === null || input === undefined) return '';
  const s = typeof input === 'string' ? input : String(input);
  const cleaned = s
    .replace(STRIP, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const chars = Array.from(cleaned);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : cleaned;
}
