import { Badge } from '@ig-live/ui';
import React from 'react';

import type { FetchModelsResult, TestResult } from '../../services/providerClient';

export const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function parseHeaders(text: string): Record<string, string> | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (t.startsWith('{')) return JSON.parse(t) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of t.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export const headersToText = (h?: Record<string, string>): string =>
  h
    ? Object.entries(h)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';

export const hostOf = (u?: string): string => {
  if (!u) return '';
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

export const TestBadge: React.FC<{ r?: TestResult | 'pending' }> = ({ r }) => {
  if (!r) return null;
  if (r === 'pending') return <Badge tone="neutral">测速中…</Badge>;
  return r.ok ? (
    <Badge tone="success" data-testid="test-ok" title={r.endpoint}>
      ✓ 连通 {r.latencyMs}ms
    </Badge>
  ) : (
    <Badge tone="danger" data-testid="test-fail" title={r.error}>
      ✗ {r.error?.slice(0, 80)}
    </Badge>
  );
};

export const FetchBadge: React.FC<{ r?: FetchModelsResult | 'pending' }> = ({ r }) => {
  if (!r) return null;
  if (r === 'pending') return <Badge tone="neutral">获取中…</Badge>;
  return r.ok ? (
    <Badge tone="success" data-testid="fetch-ok" title={r.url}>
      ✓ {r.models.length} 个模型 · {r.latencyMs}ms
    </Badge>
  ) : (
    <Badge tone="danger" data-testid="fetch-fail" title={`${r.url}\n${r.error ?? ''}`}>
      ✗ 获取失败：{r.error?.slice(0, 60)}
    </Badge>
  );
};

/** 首字母头像（与 cc-switch 的名称前图标一致；不使用任何厂商商标图） */
export const Monogram: React.FC<{ name: string; size?: number }> = ({ name, size = 32 }) => (
  <span
    aria-hidden
    className="pp-mono"
    style={{ width: size, height: size, fontSize: size * 0.42 }}
  >
    {(name.trim()[0] ?? '?').toUpperCase()}
  </span>
);
