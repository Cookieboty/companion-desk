import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { toBubbleText } from '../../src/security/bubbleText';

const PAYLOAD =
  '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script><b>粗体</b> & "引号"';

let current: string | null = PAYLOAD;
vi.mock('@/contexts/MascotContext', () => ({
  useMascot: () => ({ state: { currentMessage: current } }),
}));

describe('mascot bubble renders untrusted text literally', () => {
  it('MessageBubble escapes HTML / script', async () => {
    const { MessageBubble } = await import('../../src/components/MessageBubble/MessageBubble');
    const html = renderToStaticMarkup(<MessageBubble />);
    expect(html).not.toMatch(/<img|<script|<b>/i);
    expect(html).toContain('&lt;img src=x onerror=&quot;window.__pwned=1&quot;&gt;');
    expect(html).toContain('&lt;script&gt;window.__pwned=2&lt;/script&gt;');
    expect(html).toContain('&amp; &quot;引号&quot;');
  });

  it('MessageBubble renders nothing for null', async () => {
    current = null;
    const { MessageBubble } = await import('../../src/components/MessageBubble/MessageBubble');
    expect(renderToStaticMarkup(<MessageBubble />)).not.toContain('null');
    current = PAYLOAD;
  });

  it('toBubbleText keeps markup as characters, strips control / bidi chars, truncates', () => {
    expect(toBubbleText('<b>hi</b>')).toBe('<b>hi</b>');
    expect(toBubbleText('a\u202Eb\u0000c\u200Bd')).toBe('abcd');
    expect(toBubbleText('x  \t y\n\n\n\nz')).toBe('x y\n\nz');
    expect(toBubbleText(undefined)).toBe('');
    expect(toBubbleText(42)).toBe('42');
    const long = toBubbleText('字'.repeat(1000), 10);
    expect(Array.from(long)).toHaveLength(10);
    expect(long.endsWith('…')).toBe(true);
  });
});
