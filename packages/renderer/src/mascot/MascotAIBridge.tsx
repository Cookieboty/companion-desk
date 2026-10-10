import { useAgent, useAIEvents } from '@ig-live/ai-sdk-client/react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { directiveForEvent } from './expressionDirector';
import { applyDirective } from './mood';

import { extractAssistantText, type BubbleMessageComplete } from '@/ai/bubbleReducer';

/**
 * 聊天 / Agent / 工具事件 → 看板娘表情。
 * 仅在 preload 注入 aiIPC（AIProvider 可用）时挂载。
 */
const MascotAIBridge: FC = () => {
  const { lastStep } = useAgent();

  useEffect(() => {
    if (lastStep) applyDirective(directiveForEvent({ kind: 'agent:step' }));
  }, [lastStep]);

  useAIEvents('message:delta', () => {
    applyDirective(directiveForEvent({ kind: 'message:delta' }));
  });

  useAIEvents('message:complete', (payload) => {
    const msg = (payload as BubbleMessageComplete | undefined)?.message;
    const text = msg?.parts ? extractAssistantText(msg.parts) : undefined;
    applyDirective(directiveForEvent({ kind: 'message:complete', text }));
  });

  useAIEvents('tool:executed', (payload) => {
    const p = payload as { error?: unknown; ok?: boolean; success?: boolean } | undefined;
    const ok = p?.ok ?? p?.success ?? !p?.error;
    applyDirective(directiveForEvent({ kind: 'tool:executed', ok }));
  });

  return null;
};

export default MascotAIBridge;
