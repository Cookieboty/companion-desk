/**
 * 端点图标：Nomi / Claude Code / Codex / dsh 各一个简洁的品牌色图标（自绘几何图形，无第三方 logo）。
 * 取代原先的文字徽标；名称通过 aria-label + 悬停提示给出。
 * 颜色与灵动岛（electron/src/island/islandPage.ts）保持一致。
 */
import { t } from '@nomi-ai/ui';
import React from 'react';

import type { ConversationBackend } from '../../types/chat';
import { ENDPOINT_NAME } from '../../utils/endpointBadge';

export const ENDPOINT_COLOR: Record<ConversationBackend, string> = {
  nomi: '#f4895a',
  claude: '#d97757',
  codex: '#5f93f0',
  dsh: '#6a73e8',
};

const stroke = {
  stroke: '#fff',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const;

const GLYPH: Record<ConversationBackend, React.ReactNode> = {
  nomi: <path d="M8 3.2l1.2 3.1 3.1 1.2-3.1 1.2L8 11.8 6.8 8.7 3.7 7.5l3.1-1.2z" fill="#fff" />,
  claude: <path d="M8 3v10M3 8h10M4.5 4.5l7 7M11.5 4.5l-7 7" {...stroke} />,
  codex: <path d="M4.5 5.5L7.5 8l-3 2.5M8.8 11h3" {...stroke} />,
  dsh: <path d="M4 5.5L6.5 8 4 10.5M8 5.5L10.5 8 8 10.5" {...stroke} />,
};

export const EndpointIcon: React.FC<{
  backend: ConversationBackend;
  size?: number;
  /** 旁边已有文字名称时设为 true：不再重复朗读 / 提示 */
  decorative?: boolean;
  className?: string;
}> = ({ backend, size = 16, decorative = false, className }) => {
  const name = t(ENDPOINT_NAME[backend]);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      data-testid={`endpoint-icon-${backend}`}
      data-endpoint={backend}
      style={{ flexShrink: 0 }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
    >
      {!decorative && <title>{name}</title>}
      <rect width="16" height="16" rx="4" fill={ENDPOINT_COLOR[backend]} />
      {GLYPH[backend]}
    </svg>
  );
};
