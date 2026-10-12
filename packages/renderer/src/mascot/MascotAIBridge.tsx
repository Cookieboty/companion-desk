import { useAgent, useAIEvents } from '@ig-live/ai-sdk-client/react';
import { useEffect, useRef } from 'react';
import type { FC } from 'react';

import { StreamEmotionTracker } from './emotion';
import { directiveForEvent } from './expressionDirector';
import { applyDirective } from './mood';

import { extractAssistantText, type BubbleMessageComplete } from '@/ai/bubbleReducer';

function deltaText(p: unknown): string {
  const v = (p as { deltaText?: unknown } | undefined)?.deltaText;
  return typeof v === 'string' ? v : '';
}

/**
 * 聊天 / Agent / 工具事件 → 看板娘表情与动作。
 * - 流式回复中途出现强烈情绪就提前反应（StreamEmotionTracker）
 * - 用户停止生成 / 智能体请求确认 也有对应反应
 * 仅在 preload 注入 aiIPC（AIProvider 可用）时挂载。
 */
const MascotAIBridge: FC = () => {
  const { lastStep } = useAgent();
  const tracker = useRef(new StreamEmotionTracker());

  useEffect(() => {
    if (lastStep) applyDirective(directiveForEvent({ kind: 'agent:step' }));
  }, [lastStep]);

  useAIEvents('message:delta', (payload) => {
    const early = tracker.current.push(deltaText(payload));
    applyDirective(
      directiveForEvent(
        early ? { kind: 'message:early', emotion: early } : { kind: 'message:delta' },
      ),
    );
  });

  useAIEvents('message:complete', (payload) => {
    const msg = (payload as BubbleMessageComplete | undefined)?.message;
    const text = msg?.parts ? extractAssistantText(msg.parts) : undefined;
    const early = tracker.current.finish();
    const d = directiveForEvent({ kind: 'message:complete', text });
    // 中途已经用同一情绪做过动作 → 结尾只保持表情，不重复动作
    if (d && early && early.emotion === d.expression) delete d.motion;
    applyDirective(d);
  });

  useAIEvents('agent:stopped-by-user', () => {
    tracker.current.reset();
    applyDirective(directiveForEvent({ kind: 'stopped-by-user' }));
  });

  useAIEvents('tool:confirm-required', () => {
    applyDirective(directiveForEvent({ kind: 'confirm-required' }));
  });

  useAIEvents('tool:executed', (payload) => {
    const p = payload as { error?: unknown; ok?: boolean; success?: boolean } | undefined;
    const ok = p?.ok ?? p?.success ?? !p?.error;
    applyDirective(directiveForEvent({ kind: 'tool:executed', ok }));
  });

  return null;
};

export default MascotAIBridge;
