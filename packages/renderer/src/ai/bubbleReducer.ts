export interface BubbleAgentStep {
  sessionId?: string;
  step?: number;
  reason?: 'llm-call' | 'tool-call' | 'reflect' | 'user-input' | string;
}

export interface BubbleMessagePart {
  type: 'text' | 'image' | 'audio' | 'toolCall' | 'toolResult' | 'sensory' | string;
  text?: string;
}

export interface BubbleMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant' | 'tool' | string;
  parts?: readonly BubbleMessagePart[];
}

export interface BubbleMessageComplete {
  message: BubbleMessage;
}

export interface BubbleToolExecuted {
  toolName: string;
  reqId?: string;
  ok: boolean;
  error?: string;
}

export interface BubbleLive2dTouch {
  hitArea: string;
  at?: number;
}

export interface BubbleDirective {
  text: string;
  priority: number;
  timeout: number;
}

export type BubbleEvent =
  | { kind: 'agent:step'; payload: BubbleAgentStep }
  | { kind: 'message:complete'; payload: BubbleMessageComplete }
  | { kind: 'tool:executed'; payload: BubbleToolExecuted }
  | { kind: 'live2d:touch'; payload: BubbleLive2dTouch };

export const BUBBLE_PRIORITY = {
  agentStep: 6,
  toolExecuted: 7,
  touch: 6,
  messageComplete: 9,
} as const;

export const BUBBLE_TIMEOUT = {
  agentStep: 2500,
  toolExecuted: 3000,
  touch: 3000,
  messageComplete: 6000,
} as const;

export const AGENT_STEP_LABEL: Record<string, string> = {
  'llm-call': '正在思考中…',
  'tool-call': '正在动手做事…',
  reflect: '正在自我复盘…',
  'user-input': '在听你说…',
};

export function extractAssistantText(parts: readonly BubbleMessagePart[]): string {
  const buf: string[] = [];
  for (const p of parts) {
    if (p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0) {
      buf.push(p.text);
    }
  }
  return buf.join('\n').trim();
}

export function truncateForBubble(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + '…';
}

export function deriveBubble(evt: BubbleEvent): BubbleDirective | null {
  switch (evt.kind) {
    case 'agent:step': {
      const reason = evt.payload.reason ?? 'llm-call';
      const label = AGENT_STEP_LABEL[reason] ?? '正在处理…';
      const step = typeof evt.payload.step === 'number' ? evt.payload.step : 0;
      return {
        text: step > 0 ? `${label} (step ${step})` : label,
        priority: BUBBLE_PRIORITY.agentStep,
        timeout: BUBBLE_TIMEOUT.agentStep,
      };
    }
    case 'message:complete': {
      const msg = evt.payload.message;
      if (!msg || msg.role !== 'assistant') return null;
      const text = extractAssistantText(msg.parts ?? []);
      if (!text) return null;
      return {
        text: truncateForBubble(text),
        priority: BUBBLE_PRIORITY.messageComplete,
        timeout: BUBBLE_TIMEOUT.messageComplete,
      };
    }
    case 'tool:executed': {
      const name = evt.payload.toolName || 'tool';
      const text = evt.payload.ok
        ? `✅ 已完成：${name}`
        : `⚠️ ${name} 失败${evt.payload.error ? `：${evt.payload.error}` : ''}`;
      return {
        text: truncateForBubble(text),
        priority: BUBBLE_PRIORITY.toolExecuted,
        timeout: BUBBLE_TIMEOUT.toolExecuted,
      };
    }
    case 'live2d:touch': {
      const hit = evt.payload.hitArea || 'body';
      return {
        text: `摸到「${hit}」了~`,
        priority: BUBBLE_PRIORITY.touch,
        timeout: BUBBLE_TIMEOUT.touch,
      };
    }
    default:
      return null;
  }
}

export interface DedupeState {
  lastText?: string;
  lastAt?: number;
}

export function shouldSuppress(
  directive: BubbleDirective,
  state: DedupeState,
  now: number,
  windowMs = 1000,
): boolean {
  if (!state.lastText || state.lastAt === undefined) return false;
  if (directive.text !== state.lastText) return false;
  return now - state.lastAt < windowMs;
}
