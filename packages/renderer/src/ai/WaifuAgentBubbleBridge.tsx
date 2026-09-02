import { useAgent, useAIEvents } from '@ig-live/ai-sdk-client/react';
import { useCallback, useEffect, useRef } from 'react';
import type { FC } from 'react';

import {
  deriveBubble,
  shouldSuppress,
  type BubbleDirective,
  type BubbleLive2dTouch,
  type BubbleMessageComplete,
  type BubbleToolExecuted,
  type DedupeState,
} from './bubbleReducer';

import { useWaifuMessage } from '@/hooks/useWaifuMessage';

const WaifuAgentBubbleBridge: FC = () => {
  const { lastStep } = useAgent();
  const { showMessage } = useWaifuMessage();
  const lastAgentAtRef = useRef<number>(0);
  const dedupeRef = useRef<DedupeState>({});

  const emit = useCallback(
    (directive: BubbleDirective | null) => {
      if (!directive) return;
      const now = Date.now();
      if (shouldSuppress(directive, dedupeRef.current, now)) return;
      dedupeRef.current = { lastText: directive.text, lastAt: now };
      showMessage(directive.text, directive.timeout, directive.priority);
    },
    [showMessage],
  );

  useEffect(() => {
    if (!lastStep) return;
    if (lastStep.at <= lastAgentAtRef.current) return;
    lastAgentAtRef.current = lastStep.at;
    emit(
      deriveBubble({
        kind: 'agent:step',
        payload: {
          sessionId: lastStep.sessionId,
          step: lastStep.step,
          reason: lastStep.reason,
        },
      }),
    );
  }, [lastStep, emit]);

  useAIEvents('message:complete', (payload) => {
    emit(
      deriveBubble({
        kind: 'message:complete',
        payload: payload as BubbleMessageComplete,
      }),
    );
  });

  useAIEvents('tool:executed', (payload) => {
    emit(
      deriveBubble({
        kind: 'tool:executed',
        payload: payload as BubbleToolExecuted,
      }),
    );
  });

  useAIEvents('live2d:touch', (payload) => {
    emit(
      deriveBubble({
        kind: 'live2d:touch',
        payload: payload as BubbleLive2dTouch,
      }),
    );
  });

  return null;
};

export default WaifuAgentBubbleBridge;
