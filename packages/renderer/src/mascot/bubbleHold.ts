/**
 * 气泡淡出期间保留最后一条非空文本。
 *
 * 旧实现：消息清空（CLEAR_MESSAGE / 超时）后 `currentMessage` 立即变 null，但气泡还要 300ms
 * 才淡出——这 300ms 内渲染的是空文本，测量层把气泡缩成一个空胶囊，看起来就是「空气泡闪一下」。
 * AI 回复完成时恰好是「思考中…」气泡超时清空 → 新回复到达之间，最容易看到。
 */
export interface BubbleHold {
  text: string;
  more: boolean;
  /** 气泡是否处于可见（含淡出中） */
  active: boolean;
}

export const EMPTY_HOLD: BubbleHold = { text: '', more: false, active: false };

/** 新消息到达：显示它；空 / 只有空白的消息不会让气泡出现 */
export function holdOnMessage(prev: BubbleHold, text: string, more: boolean): BubbleHold {
  if (text.trim()) return { text, more, active: true };
  // 消息被清空：保留旧文本淡出（active 由 holdOnHidden 在淡出结束后关）
  return prev.text ? { ...prev } : EMPTY_HOLD;
}

/** 淡出动画结束 */
export function holdOnHidden(): BubbleHold {
  return EMPTY_HOLD;
}
