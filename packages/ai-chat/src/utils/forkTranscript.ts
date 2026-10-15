/**
 * 跨端分叉时整理可见消息：保留 user / assistant 文本；
 * 工具调用压成一行摘要，去掉大块 blob，便于粘贴进 CLI。
 * 不声称跨 CLI 真正 resume。
 */
import { t } from '@nomi-ai/ui';

import type { ChatMessage } from '../types/chat';

export interface CompactTranscriptOpts {
  /** 最多保留的轮次（user+assistant 对），默认 40 */
  maxTurns?: number;
  /** 单条内容最大字符，默认 4000 */
  maxChars?: number;
}

/** 从完整消息列表提取适合复制 / 粘贴的轻量消息 */
export function compactTranscript(
  messages: ChatMessage[],
  opts: CompactTranscriptOpts = {},
): ChatMessage[] {
  const maxTurns = opts.maxTurns ?? 40;
  const maxChars = opts.maxChars ?? 4000;
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.error) continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    let content = (m.content || '').trim();
    if (!content) continue;
    // 工具结果块常见前缀：压成短注
    if (/^\[tool[:\s]/i.test(content) || content.startsWith('```tool')) {
      content = t('[工具调用已省略]');
    }
    if (content.length > maxChars) content = `${content.slice(0, maxChars)}…`;
    out.push({
      id: m.id,
      role,
      content,
      timestamp: m.timestamp,
      ...(m.modelId ? { modelId: m.modelId } : {}),
    });
  }
  // 按轮裁剪：从尾部保留
  if (out.length > maxTurns * 2) return out.slice(-(maxTurns * 2));
  return out;
}

/** 拼成给 CLI 的首条上下文 preface（作为第一条 user 消息内容） */
export function buildCliContextPreface(messages: ChatMessage[], sourceLabel: string): string {
  const compact = compactTranscript(messages);
  if (compact.length === 0) return '';
  const lines = compact.map((m) => {
    const who = m.role === 'user' ? 'User' : 'Assistant';
    return `${who}: ${m.content}`;
  });
  return [
    t(
      '以下是从「{0}」分叉带来的对话摘录，仅作上下文参考（并非本 CLI 的可续接会话）：',
      sourceLabel,
    ),
    '',
    ...lines,
    '',
    t('请基于以上上下文继续。'),
  ].join('\n');
}
