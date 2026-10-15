/**
 * 端点徽标：短标签 + 与灵动岛一致的色调（claude 橙、codex 蓝、dsh 蓝紫、nomi 珊瑚）。
 */
import { t } from '@nomi-ai/ui';

import type { ConversationBackend } from '../types/chat';

export const ENDPOINT_SHORT: Record<ConversationBackend, string> = {
  nomi: 'Nomi',
  claude: 'Claude',
  codex: 'Codex',
  dsh: 'dsh',
};

export const ENDPOINT_FULL: Record<ConversationBackend, () => string> = {
  nomi: () => t('Nomi'),
  claude: () => t('Claude Code'),
  codex: () => t('Codex'),
  dsh: () => 'dsh',
};

/** CSS 变量友好的 data-ep 值，样式见 Sidebar / ChatModeSwitch */
export const ENDPOINT_CSS: Record<ConversationBackend, string> = {
  nomi: 'nomi',
  claude: 'claude',
  codex: 'codex',
  dsh: 'dsh',
};

export const CLI_BACKENDS: ConversationBackend[] = ['claude', 'codex', 'dsh'];

export function isCliBackend(b: ConversationBackend): boolean {
  return b !== 'nomi';
}
