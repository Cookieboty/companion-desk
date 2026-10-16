/** 助手正文的 Markdown 渲染：AST → React 元素（不用 innerHTML） */
import { Icon, t } from '@nomi-ai/ui';
import { Check, Copy } from 'lucide-react';
import React, { memo, useMemo, useState } from 'react';

import { parseMarkdown, type Block, type Inline } from '../../utils/markdown';

import styles from './Markdown.module.css';

function renderInline(nodes: Inline[]): React.ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <React.Fragment key={i}>{n.v}</React.Fragment>;
      case 'code':
        return (
          <code key={i} className={styles.inlineCode}>
            {n.v}
          </code>
        );
      case 'strong':
        return <strong key={i}>{renderInline(n.c)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(n.c)}</em>;
      case 'del':
        return <del key={i}>{renderInline(n.c)}</del>;
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noreferrer noopener">
            {renderInline(n.c)}
          </a>
        );
      default:
        return <br key={i} />;
    }
  });
}

const CodeBlock: React.FC<{ lang: string; code: string }> = ({ lang, code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <div className={styles.codeBlock} data-testid="md-code">
      <div className={styles.codeHead}>
        <span>{lang || t('代码')}</span>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={copy}
          aria-label={t('复制代码')}
          title={t('复制代码')}
        >
          <Icon icon={copied ? Check : Copy} size={13} />
        </button>
      </div>
      <pre className={styles.codePre}>
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderBlocks(blocks: Block[]): React.ReactNode[] {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'p':
        return <p key={i}>{renderInline(b.c)}</p>;
      case 'h': {
        const H = `h${Math.min(6, b.level + 1)}` as 'h2';
        return <H key={i}>{renderInline(b.c)}</H>;
      }
      case 'code':
        return <CodeBlock key={i} lang={b.lang} code={b.v} />;
      case 'ul':
      case 'ol': {
        const L = b.t;
        return (
          <L key={i} {...(b.t === 'ol' && b.start ? { start: b.start } : {})}>
            {b.items.map((it, k) => (
              <li key={k} className={it.checked !== undefined ? styles.task : undefined}>
                {it.checked !== undefined && (
                  <input type="checkbox" checked={it.checked} readOnly aria-hidden tabIndex={-1} />
                )}
                {renderBlocks(it.c)}
              </li>
            ))}
          </L>
        );
      }
      case 'quote':
        return <blockquote key={i}>{renderBlocks(b.c)}</blockquote>;
      case 'hr':
        return <hr key={i} />;
      default:
        return (
          <div key={i} className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {b.head.map((c, k) => (
                    <th key={k} style={{ textAlign: b.align[k] ?? undefined }}>
                      {renderInline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, k) => (
                      <td key={k} style={{ textAlign: b.align[k] ?? undefined }}>
                        {renderInline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

export const Markdown: React.FC<{ text: string; className?: string }> = memo(
  ({ text, className }) => {
    const blocks = useMemo(() => parseMarkdown(text), [text]);
    return (
      <div className={`${styles.md} ${className ?? ''}`} data-testid="markdown">
        {renderBlocks(blocks)}
      </div>
    );
  },
);
Markdown.displayName = 'Markdown';
