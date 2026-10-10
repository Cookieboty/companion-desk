import type { MascotExpression } from './MascotBackend';

/**
 * 根据聊天/TTS 事件决定看板娘表情（纯函数，便于测试）。
 */

const RULES: Array<{ expr: MascotExpression; re: RegExp }> = [
  { expr: 'angry', re: /(生气|气死|可恶|讨厌|哼[!！]|angry|annoyed|furious|😠|😡)/i },
  {
    expr: 'sad',
    re: /(抱歉|对不起|遗憾|难过|伤心|失败|无法|不能|sorry|unfortunately|sad|can't|cannot|😢|😭)/i,
  },
  { expr: 'surprised', re: /(哇|诶[?？!！]|竟然|居然|wow|whoa|really\?|😮|😲)/i },
  {
    expr: 'happy',
    re: /(哈哈|开心|太好了|好的|当然|没问题|恭喜|谢谢|加油|great|awesome|glad|happy|sure|done|✨|😊|😄|🎉)/i,
  },
];

export function expressionForText(text: string | null | undefined): MascotExpression {
  if (!text) return 'neutral';
  for (const { expr, re } of RULES) {
    if (re.test(text)) return expr;
  }
  return 'happy';
}

/** 文本 → 配合的身体动作（可无） */
const MOTION_RULES: Array<{ motion: string; re: RegExp }> = [
  { motion: 'wave', re: /(你好|您好|嗨|早上好|晚上好|再见|拜拜|\bhello\b|\bhi\b|\bbye\b|👋)/i },
  { motion: 'bow', re: /(抱歉|对不起|不好意思|谢谢|感谢|sorry|thank you|thanks)/i },
  { motion: 'cheer', re: /(太好了|恭喜|成功了|耶|hooray|congrat|🎉)/i },
  { motion: 'think', re: /(让我想想|我想想|思考|嗯…|hmm|let me think)/i },
];

const EXPRESSION_MOTION: Partial<Record<MascotExpression, string>> = {
  happy: 'nod',
  angry: 'shake',
  sad: 'shake',
  surprised: 'flinch',
};

export function motionForText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  for (const { motion, re } of MOTION_RULES) {
    if (re.test(text)) return motion;
  }
  return EXPRESSION_MOTION[expressionForText(text)];
}

export type MascotEvent =
  | { kind: 'agent:step' }
  | { kind: 'message:delta' }
  | { kind: 'message:complete'; text?: string }
  | { kind: 'tool:executed'; ok: boolean }
  | { kind: 'error' }
  | { kind: 'tts:end' };

export interface ExpressionDirective {
  expression: MascotExpression;
  /** 持续时间（ms）；到期回到 neutral。0 = 保持。 */
  holdMs: number;
  /** 可选的身体动作（由 mood.applyDirective 节流播放） */
  motion?: string;
}

export function directiveForEvent(evt: MascotEvent): ExpressionDirective | null {
  switch (evt.kind) {
    case 'agent:step':
      return { expression: 'relaxed', holdMs: 4000, motion: 'think' };
    case 'message:delta':
      return { expression: 'relaxed', holdMs: 4000 };
    case 'message:complete':
      return {
        expression: expressionForText(evt.text),
        holdMs: 3500,
        motion: motionForText(evt.text),
      };
    case 'tool:executed':
      return evt.ok
        ? { expression: 'happy', holdMs: 1500, motion: 'nod' }
        : { expression: 'sad', holdMs: 3000, motion: 'shake' };
    case 'error':
      return { expression: 'sad', holdMs: 3500, motion: 'shake' };
    case 'tts:end':
      return null;
    default:
      return null;
  }
}
