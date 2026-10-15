/**
 * 分句：按句末标点 / 换行切分（标点保留在句尾）；过长句再按逗号等软标点切；
 * 仍超长则硬切。丢弃无可读字符（只有标点 / 空白）的片段。纯函数。
 */
const HARD = /[^。！？!?；;\n\r…]+[。！？!?；;…]*|[。！？!?；;…]+/g;
const SOFT = /[^，,、：:]+[，,、：:]*/g;
const READABLE = /[\p{L}\p{N}]/u;

export function splitSentences(text: string, maxLen = 80): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && READABLE.test(t)) out.push(t);
  };
  for (const raw of text.match(HARD) ?? []) {
    const sentence = raw.trim();
    if (sentence.length <= maxLen) {
      push(sentence);
      continue;
    }
    let buf = '';
    for (const piece of sentence.match(SOFT) ?? [sentence]) {
      if (buf && buf.length + piece.length > maxLen) {
        push(buf);
        buf = '';
      }
      buf += piece;
      while (buf.length > maxLen) {
        push(buf.slice(0, maxLen));
        buf = buf.slice(maxLen);
      }
    }
    push(buf);
  }
  return out;
}
