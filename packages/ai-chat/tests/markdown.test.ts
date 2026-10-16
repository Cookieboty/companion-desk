import { describe, expect, it } from 'vitest';

import { parseInline, parseMarkdown, safeHref } from '../src/utils/markdown';

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
