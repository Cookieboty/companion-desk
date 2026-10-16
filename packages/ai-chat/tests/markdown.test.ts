import { describe, expect, it } from 'vitest';

import { parseInline, parseMarkdown, safeHref, splitMarkdownChunks } from '../src/utils/markdown';

describe('parseMarkdown blocks', () => {
  it('parses headings, paragraphs, lists, quotes and rules', () => {
    const b = parseMarkdown('# 标题\n\n第一段\n第二行\n\n- a\n- b\n\n1. x\n2. y\n\n> 引用\n\n---');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol', 'quote', 'hr']);
    expect(b[2]).toMatchObject({ t: 'ul', items: [{}, {}] });
  });

  it('keeps fenced code verbatim, including an unclosed (streaming) fence', () => {
    const closed = parseMarkdown('```ts\nconst a = 1;\n# not heading\n```\n后文');
    expect(closed[0]).toEqual({ t: 'code', lang: 'ts', v: 'const a = 1;\n# not heading' });
    expect(closed[1]).toMatchObject({ t: 'p' });
    const open = parseMarkdown('```bash\nnpm i');
    expect(open).toEqual([{ t: 'code', lang: 'bash', v: 'npm i' }]);
  });

  it('parses nested lists, task items and tables', () => {
    const b = parseMarkdown(
      '- a\n  - b\n- [x] done\n- [ ] todo\n\n| h1 | h2 |\n| :-- | --: |\n| 1 | 2 |',
    );
    const ul = b[0]!;
    expect(ul.t === 'ul' && ul.items[0]!.c.map((x) => x.t)).toEqual(['p', 'ul']);
    expect(ul.t === 'ul' && ul.items[1]).toMatchObject({ checked: true });
    expect(ul.t === 'ul' && ul.items[2]).toMatchObject({ checked: false });
    expect(b[1]).toMatchObject({ t: 'table', align: ['left', 'right'] });
  });

  it('ordered list keeps its start number', () => {
    expect(parseMarkdown('3. a\n4. b')[0]).toMatchObject({ t: 'ol', start: 3 });
  });
});

describe('parseInline', () => {
  it('handles code, bold, italic, strike and links', () => {
    const r = parseInline('a `x*y` **b** *i* ~~d~~ [t](https://a.dev)');
    expect(r.map((n) => n.t)).toEqual([
      'text',
      'code',
      'text',
      'strong',
      'text',
      'em',
      'text',
      'del',
      'text',
      'link',
    ]);
    expect(r[1]).toEqual({ t: 'code', v: 'x*y' });
  });

  it('does not treat snake_case or lone asterisks as emphasis', () => {
    expect(parseInline('snake_case_name and 2 * 3')).toEqual([
      { t: 'text', v: 'snake_case_name and 2 * 3' },
    ]);
  });

  it('drops unsafe link targets but keeps the text', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://a.dev/x')).toBe('https://a.dev/x');
    const r = parseInline('[点我](javascript:alert(1))');
    expect(r.every((n) => n.t !== 'link')).toBe(true);
    expect(r[0]).toEqual({ t: 'text', v: '点我' });
  });

  it('never produces raw html: tags stay text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { t: 'text', v: '<img src=x onerror=alert(1)>' },
    ]);
  });
});

describe('splitMarkdownChunks (incremental streaming)', () => {
  const doc = [
    '## 小结',
    '',
    '段落 **一**，含 `code`。',
    '',
    '- 条目一',
    '- 条目二',
    '',
    '```ts',
    'const x = 1;',
    '',
    'console.log(x);',
    '```',
    '',
    '1. 第一',
    '',
    '2. 第二',
    '',
    '> 引用一',
    '',
    '> 引用二',
    '',
    '尾段',
  ].join('\n');

  it('splits at safe boundaries only: never inside a fence, never between list items', () => {
    const chunks = splitMarkdownChunks(doc);
    expect(chunks.length).toBeGreaterThan(3);
    // 代码块里的空行不是边界
    expect(chunks.some((c) => c.includes('const x = 1;\n\nconsole.log(x);'))).toBe(true);
    // 松散的有序列表（第一 / 第二之间有空行）保持在同一段
    expect(chunks.some((c) => c.includes('1. 第一') && c.includes('2. 第二'))).toBe(true);
  });

  it('parsing the chunks one by one equals parsing the whole document', () => {
    const whole = parseMarkdown(doc);
    const parts = splitMarkdownChunks(doc).flatMap((c) => parseMarkdown(c));
    expect(parts).toEqual(whole);
  });

  it('is prefix-stable while streaming: earlier chunks stop changing once a boundary has passed', () => {
    const full = splitMarkdownChunks(doc);
    for (let n = 40; n < doc.length; n += 17) {
      const part = splitMarkdownChunks(doc.slice(0, n));
      // 除最后一段外，流式中间态的每一段都和最终文本的对应段完全一致
      for (let i = 0; i < part.length - 1; i++) expect(part[i]).toBe(full[i]);
    }
  });

  it('handles unclosed fences and CRLF', () => {
    expect(splitMarkdownChunks('前文\n\n```bash\nnpm i\n\nnpm test')).toHaveLength(2);
    expect(splitMarkdownChunks('a\r\n\r\nb')).toEqual(['a\n', 'b']);
  });
});
