/**
 * 轻量 Markdown 解析（只产出 AST，不拼 HTML，渲染端用 React 元素 → 天然防注入）。
 * 支持：围栏代码块（含未闭合的流式半截）、标题、列表（有序 / 无序 / 任务）、引用、分隔线、
 * 表格、段落；行内：代码、粗体、斜体、删除线、链接（仅 http/https/mailto）。
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'del'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'ul' | 'ol'; start?: number; items: ListItem[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'hr' }
  | {
      t: 'table';
      head: Inline[][];
      align: Array<'left' | 'center' | 'right' | null>;
      rows: Inline[][][];
    };

export interface ListItem {
  checked?: boolean;
  c: Block[];
}

export function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https?:\/\/|mailto:)/i.test(h) ? h : null;
}

// ───────────────────────── 行内 ─────────────────────────

const SPECIALS = /[`*_~[\\\n]/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (!SPECIALS.test(ch)) {
      buf += ch;
      i++;
      continue;
    }
    if (ch === '\\' && i + 1 < src.length && /[\\`*_~[\]()#+\-.!>|{}]/.test(src[i + 1]!)) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      flush();
      out.push({ t: 'br' });
      i++;
      continue;
    }
    if (ch === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      const end = src.indexOf(fence, i + n);
      if (end > i + n - 1 && end !== -1) {
        flush();
        out.push({ t: 'code', v: src.slice(i + n, end).replace(/^ (.*) $/s, '$1') });
        i = end + n;
        continue;
      }
      buf += fence;
      i += n;
      continue;
    }
    if (ch === '[') {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(src.slice(i));
      if (m) {
        const href = safeHref(m[2]!);
        flush();
        if (href) out.push({ t: 'link', href, c: parseInline(m[1]!) });
        else out.push(...parseInline(m[1]!));
        i += m[0].length;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
    // * _ ~ 强调
    const run = /^(\*\*|__|~~|\*|_)/.exec(src.slice(i))?.[1];
    if (run) {
      const prev = src[i - 1] ?? ' ';
      const after = src[i + run.length] ?? ' ';
      // `_` 在单词内部不是强调（snake_case）
      const intraword = run[0] === '_' && /\w/.test(prev);
      if (!/\s/.test(after) && !intraword) {
        let end = -1;
        let from = i + run.length;
        while (from < src.length) {
          const k = src.indexOf(run, from);
          if (k === -1) break;
          const before = src[k - 1] ?? ' ';
          const nxt = src[k + run.length] ?? ' ';
          if (!/\s/.test(before) && !(run[0] === '_' && /\w/.test(nxt)) && k > i + run.length - 1) {
            end = k;
            break;
          }
          from = k + run.length;
        }
        if (end > i + run.length) {
          flush();
          const c = parseInline(src.slice(i + run.length, end));
          out.push(
            run === '**' || run === '__'
              ? { t: 'strong', c }
              : run === '~~'
                ? { t: 'del', c }
                : { t: 'em', c },
          );
          i = end + run.length;
          continue;
        }
      }
      buf += run;
      i += run.length;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// ───────────────────────── 块 ─────────────────────────

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const UL = /^(\s*)([-*+])\s+(.*)$/;
const OL = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

export function parseMarkdown(src: string): Block[] {
  return parseBlocks(src.replace(/\r\n?/g, '\n').split('\n'));
}

function isBlockStart(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line);
}

function parseBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i++;
      // 未闭合（流式输出中）：一直到末尾
      while (
        i < lines.length &&
        !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i]!)
      ) {
        body.push(lines[i]!);
        i++;
      }
      i++;
      out.push({ t: 'code', lang: fence[2] ?? '', v: body.join('\n') });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1]!.length as 1, c: parseInline(h[2]!) });
      i++;
      continue;
    }
    if (HR.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        inner.push(QUOTE.exec(lines[i]!)![1]!);
        i++;
      }
      out.push({ t: 'quote', c: parseBlocks(inner) });
      continue;
    }
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEP.test(lines[i + 1]!) &&
      lines[i + 1]!.includes('-')
    ) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]!).map((c) =>
        /^:-+:$/.test(c)
          ? ('center' as const)
          : /^-+:$/.test(c)
            ? ('right' as const)
            : /^:-+$/.test(c)
              ? ('left' as const)
              : null,
      );
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|')) {
        rows.push(splitRow(lines[i]!).map(parseInline));
        i++;
      }
      out.push({ t: 'table', head: head.map(parseInline), align, rows });
      continue;
    }
    const li = UL.exec(line) ?? OL.exec(line);
    if (li) {
      const ordered = OL.test(line) && !UL.test(line);
      const baseIndent = li[1]!.length;
      const items: ListItem[] = [];
      const start = ordered ? Number(OL.exec(line)![2]) : undefined;
      while (i < lines.length) {
        const m = (ordered ? OL : UL).exec(lines[i]!);
        if (!m || m[1]!.length !== baseIndent) break;
        const first = m[ordered ? 3 : 3]!;
        const body: string[] = [first];
        i++;
        // 续行 / 嵌套：缩进更深或空行后仍缩进
        while (i < lines.length) {
          const nxt = lines[i]!;
          if (!nxt.trim()) {
            if (
              i + 1 < lines.length &&
              /^\s{2,}\S/.test(lines[i + 1]!) &&
              lines[i + 1]!.search(/\S/) > baseIndent
            ) {
              body.push('');
              i++;
              continue;
            }
            break;
          }
          if (nxt.search(/\S/) > baseIndent) {
            body.push(nxt.slice(Math.min(nxt.search(/\S/), baseIndent + 2)));
            i++;
            continue;
          }
          break;
        }
        const task = /^\[([ xX])\]\s+/.exec(body[0]!);
        if (task) body[0] = body[0]!.slice(task[0].length);
        items.push({
          ...(task ? { checked: task[1] !== ' ' } : {}),
          c: parseBlocks(body),
        });
      }
      out.push({
        t: ordered ? 'ol' : 'ul',
        ...(start !== undefined && start !== 1 ? { start } : {}),
        items,
      });
      continue;
    }
    // 段落：到空行或下一个块起点
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !isBlockStart(lines[i]!) &&
      !UL.test(lines[i]!) &&
      !OL.test(lines[i]!)
    ) {
      para.push(lines[i]!);
      i++;
    }
    out.push({ t: 'p', c: parseInline(para.join('\n')) });
  }
  return out;
}
