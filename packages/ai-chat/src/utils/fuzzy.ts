/**
 * 侧栏会话搜索用的模糊匹配（纯函数，中文友好，无依赖）。
 *
 * 查询按空白切成词，**每个词都要命中**（AND）。单个词的命中方式，分高到低：
 * 1. 子串（忽略大小写 / 全半角）：开头、词边界命中加分，越靠前越好；
 * 2. 子序列（容错）：字符按顺序出现即可，如 `rflg` → `Refactor login flow`；
 *    连续命中加分，跨度过大（噪声）不算命中；单字符只做子串。
 * 字段有权重（标题 > 首条消息 > 路径 > 端点名）；返回标题上的命中区间用于高亮。
 */

export type Range = [start: number, end: number];

export interface SearchField {
  text: string;
  weight: number;
  /** 命中区间是否返回（用于高亮；通常只有标题） */
  highlight?: boolean;
}

export interface FuzzyResult {
  score: number;
  ranges: Range[];
}

/** 小写 + 全角转半角（长度不变，区间可直接用于原文） */
export function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0xff01 && c <= 0xff5e) out += String.fromCodePoint(c - 0xfee0).toLowerCase();
    else if (c === 0x3000) out += ' ';
    else out += ch.toLowerCase();
  }
  return out;
}

export function tokenize(query: string): string[] {
  return fold(query)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const isBoundary = (text: string, i: number) =>
  i === 0 || /[\s/\\._\-:|,()[\]]/.test(text[i - 1]!) || text.charCodeAt(i - 1) > 127;

/** 单个词在一段（已 fold 的）文本里的最佳命中；没有返回 null */
export function matchToken(token: string, text: string): FuzzyResult | null {
  if (!token || !text) return null;
  const idx = text.indexOf(token);
  if (idx >= 0) {
    const score = 100 + (idx === 0 ? 30 : isBoundary(text, idx) ? 15 : 0) - Math.min(idx, 50) * 0.2;
    return { score, ranges: [[idx, idx + token.length]] };
  }
  if (token.length < 2) return null;
  // 子序列：贪心取最早位置，再尽量往后收紧起点以减小跨度
  const pos: number[] = [];
  let from = 0;
  for (const ch of token) {
    const p = text.indexOf(ch, from);
    if (p < 0) return null;
    pos.push(p);
    from = p + 1;
  }
  // 从最后一个字符向前收紧，让匹配更紧凑
  for (let k = pos.length - 2, limit = pos[pos.length - 1]!; k >= 0; k--) {
    const p = text.lastIndexOf(token[k]!, limit - 1);
    if (p > pos[k]!) pos[k] = p;
    limit = pos[k]!;
  }
  const span = pos[pos.length - 1]! - pos[0]! + 1;
  if (span > token.length * 4 + 8) return null;
  let runs = 0;
  const ranges: Range[] = [];
  for (let k = 0; k < pos.length; k++) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === pos[k]) last[1] = pos[k]! + 1;
    else {
      ranges.push([pos[k]!, pos[k]! + 1]);
      runs++;
    }
  }
  const score =
    40 +
    (pos[0] === 0 || isBoundary(text, pos[0]!) ? 8 : 0) -
    (runs - 1) * 4 -
    (span - token.length) * 0.5 -
    Math.min(pos[0]!, 40) * 0.1;
  return { score: Math.max(score, 1), ranges };
}

function mergeRanges(r: Range[]): Range[] {
  const s = [...r].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else out.push([x[0], x[1]]);
  }
  return out;
}

/** 多个字段 + 多个词：每个词取各字段加权后的最佳，求和；任一词没命中则整体不命中 */
export function matchFields(tokens: string[], fields: SearchField[]): FuzzyResult | null {
  if (!tokens.length) return { score: 0, ranges: [] };
  const folded = fields.map((f) => ({ ...f, folded: fold(f.text) }));
  let total = 0;
  const ranges: Range[] = [];
  for (const tok of tokens) {
    let best: { score: number; ranges: Range[]; hl: boolean } | null = null;
    for (const f of folded) {
      const m = matchToken(tok, f.folded);
      if (!m) continue;
      const s = m.score * f.weight;
      if (!best || s > best.score) best = { score: s, ranges: m.ranges, hl: Boolean(f.highlight) };
    }
    if (!best) return null;
    total += best.score;
    // 标题上也能命中同一个词时，优先用标题区间做高亮
    const title = folded.find((f) => f.highlight);
    const tm = title ? matchToken(tok, title.folded) : null;
    if (tm) ranges.push(...tm.ranges);
    else if (best.hl) ranges.push(...best.ranges);
  }
  return { score: total, ranges: mergeRanges(ranges) };
}

export interface Ranked<T> {
  item: T;
  score: number;
  ranges: Range[];
}

/** 过滤并排序：分数高在前，同分保持原顺序（调用方传入时已按更新时间排好） */
export function rankItems<T>(
  items: readonly T[],
  query: string,
  fieldsOf: (item: T) => SearchField[],
  limit = Infinity,
): Ranked<T>[] {
  const tokens = tokenize(query);
  if (!tokens.length) return items.slice(0, limit).map((item) => ({ item, score: 0, ranges: [] }));
  const out: Array<Ranked<T> & { i: number }> = [];
  items.forEach((item, i) => {
    const m = matchFields(tokens, fieldsOf(item));
    if (m) out.push({ item, score: m.score, ranges: m.ranges, i });
  });
  out.sort((a, b) => b.score - a.score || a.i - b.i);
  return out.slice(0, limit).map(({ item, score, ranges }) => ({ item, score, ranges }));
}
