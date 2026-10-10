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
}

export function directiveForEvent(evt: MascotEvent): ExpressionDirective | null {
  switch (evt.kind) {
    case 'agent:step':
    case 'message:delta':
      return { expression: 'relaxed', holdMs: 4000 };
    case 'message:complete':
      return { expression: expressionForText(evt.text), holdMs: 3500 };
    case 'tool:executed':
      return evt.ok ? { expression: 'happy', holdMs: 1500 } : { expression: 'sad', holdMs: 3000 };
    case 'error':
      return { expression: 'sad', holdMs: 3500 };
    case 'tts:end':
      return null;
    default:
      return null;
  }
}
