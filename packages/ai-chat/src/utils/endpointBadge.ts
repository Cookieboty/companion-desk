/**
 * 端点徽标：短标签 + 与灵动岛一致的色调（claude 橙、codex 蓝、dsh 蓝紫、nomi 珊瑚）。
 */
import { t } from '@nomi-ai/ui';

import type { ConversationBackend } from '../types/chat';

/** 端点名称：统一为 Nomi / Claude Code / Codex / dsh（专有名词不翻译） */
export const ENDPOINT_NAME: Record<ConversationBackend, string> = {
  nomi: 'Nomi',
  claude: 'Claude Code',
  codex: 'Codex',
  dsh: 'dsh',
};

/** @deprecated 与 ENDPOINT_NAME 相同；保留给还未迁移的调用方 */
export const ENDPOINT_SHORT = ENDPOINT_NAME;

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
