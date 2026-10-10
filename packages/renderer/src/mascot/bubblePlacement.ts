import type { Box } from './layoutStore';

/**
 * 气泡摆放（纯函数）：永远不压住脸 / 头部，也避开工具栏槽位。
 * 候选顺序：头顶 → 头侧（远离工具栏 / 屏幕边缘的一侧优先）→ 另一侧 → 头部下方（肩部，尾巴朝上）。
 * 每个候选都要：整体在窗口内、（若给了屏幕信息）在屏幕工作区内、不与头部 / 工具栏相交。
 * 都不行时退到头部下方并夹在窗口内（仍不会盖住头部）。
 */
export type TailSide = 'bottom' | 'left' | 'right' | 'top';

export interface BubbleInput {
  head: Box;
  view: { width: number; height: number };
  /** 给定宽度时气泡高度（已按 maxHeight 截断） */
  measure: (width: number) => number;
  gutter?: Box | null;
  screen?: { winX: number; winY?: number; availLeft: number; availWidth: number };
  /** 期望宽度 / 最小宽度 */
  prefWidth?: number;
  minWidth?: number;
  gap?: number;
  margin?: number;
}

export interface BubblePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  tail: TailSide;
  /** 尾巴尖沿所在边的偏移（px，从气泡左/上边算起），指向头部中心 */
  tailOffset: number;
  candidate: 'above' | 'left' | 'right' | 'below';
}

export const intersects = (a: Box, b: Box): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function placeBubble(i: BubbleInput): BubblePlacement {
  const gap = i.gap ?? 14; // 含尾巴
  const m = i.margin ?? 6;
  const pref = i.prefWidth ?? 220;
  const min = i.minWidth ?? 100;
  const { head, view } = i;
  const hx = (head.left + head.right) / 2;
  const hy = (head.top + head.bottom) / 2;
  const avoid = [head, ...(i.gutter ? [i.gutter] : [])];

  const onScreen = (x: number, w: number) => {
    if (!i.screen) return true;
    const sx = i.screen.winX + x;
    return sx >= i.screen.availLeft && sx + w <= i.screen.availLeft + i.screen.availWidth;
  };
  const ok = (x: number, y: number, w: number, h: number) => {
    const r = { left: x, top: y, right: x + w, bottom: y + h };
    return (
      x >= m &&
      y >= m &&
      r.right <= view.width - m &&
      r.bottom <= view.height - m &&
      onScreen(x, w) &&
      !avoid.some((a) => intersects(r, a))
    );
  };

  // 侧边优先级：工具栏在哪边，气泡就去另一边；屏幕边缘外的一侧靠后
  const gutterRight = i.gutter ? (i.gutter.left + i.gutter.right) / 2 > hx : true;
  const sides: Array<'left' | 'right'> = gutterRight ? ['left', 'right'] : ['right', 'left'];

  const tried: BubblePlacement[] = [];
  const consider = (p: BubblePlacement) => {
    tried.push(p);
    return ok(p.x, p.y, p.width, p.height) ? p : null;
  };

  const MIN_H = 56; // 高度不够时允许压缩（内容在气泡内滚动），但不少于约两行
  const fullW = clamp(view.width - 2 * m, min, pref);
  const fullH = i.measure(fullW);
  const xCentered = clamp(hx - fullW / 2, m, view.width - m - fullW);
  const roomAbove = head.top - gap - m;
  const roomBelow = view.height - m - (head.bottom + gap);

  // 1. 头顶（放不下完整高度时压缩到可用空间）
  if (roomAbove >= Math.min(fullH, MIN_H)) {
    const h = Math.min(fullH, roomAbove);
    const r = consider({
      x: xCentered,
      y: head.top - gap - h,
      width: fullW,
      height: h,
      tail: 'bottom',
      tailOffset: clamp(hx - xCentered, 14, fullW - 14),
      candidate: 'above',
    });
    if (r && h === fullH) return round(r);
  }
  // 2/3. 头侧
  for (const side of sides) {
    const room = side === 'left' ? head.left - gap - m : view.width - m - (head.right + gap);
    if (room < min) continue;
    const w = Math.min(pref, room);
    const h = Math.min(i.measure(w), view.height - 2 * m);
    const x = side === 'left' ? head.left - gap - w : head.right + gap;
    const y = clamp(hy - h / 2, m, view.height - m - h);
    const r = consider({
      x,
      y,
      width: w,
      height: h,
      tail: side === 'left' ? 'right' : 'left',
      tailOffset: clamp(hy - y, 14, h - 14),
      candidate: side,
    });
    if (r) return round(r);
  }
  // 4. 头部下方（肩膀旁，尾巴朝上），同样可压缩高度
  const below = (h: number): BubblePlacement => {
    let x = xCentered;
    const y = head.bottom + gap;
    if (i.gutter && intersects({ left: x, right: x + fullW, top: y, bottom: y + h }, i.gutter)) {
      x = gutterRight
        ? clamp(i.gutter.left - 4 - fullW, m, view.width - m - fullW)
        : clamp(i.gutter.right + 4, m, view.width - m - fullW);
    }
    return {
      x,
      y,
      width: fullW,
      height: h,
      tail: 'top',
      tailOffset: clamp(hx - x, 14, fullW - 14),
      candidate: 'below',
    };
  };
  if (roomBelow >= Math.min(fullH, MIN_H)) {
    const r = consider(below(Math.min(fullH, roomBelow)));
    if (r) return round(r);
  }
  // 头顶压缩版（工具栏冲突等导致上面没返回时）
  const squeezedAbove = tried.find(
    (t) => t.candidate === 'above' && ok(t.x, t.y, t.width, t.height),
  );
  if (squeezedAbove) return round(squeezedAbove);
  // 实在没有空间：取上下空间较大的一侧，夹在窗口内（极端情况下可能贴到头部）
  if (roomBelow >= roomAbove) return round(below(Math.max(MIN_H, Math.min(fullH, roomBelow))));
  const h = Math.max(MIN_H, Math.min(fullH, roomAbove));
  return round({
    x: xCentered,
    y: Math.max(m, head.top - gap - h),
    width: fullW,
    height: h,
    tail: 'bottom',
    tailOffset: clamp(hx - xCentered, 14, fullW - 14),
    candidate: 'above',
  });
}

function round(p: BubblePlacement): BubblePlacement {
  return {
    ...p,
    x: Math.round(p.x),
    y: Math.round(p.y),
    width: Math.round(p.width),
    height: Math.round(p.height),
    tailOffset: Math.round(p.tailOffset),
  };
}

/** 头部矩形 → 字号缩放（模型 / 相机变大时气泡字也略大），0.85~1.15 */
export const bubbleScale = (head: Box): number => clamp((head.right - head.left) / 80, 0.85, 1.15);

/** 回复摘要：取前一两句，按字符封顶；被截断时 truncated=true（显示「查看全文」） */
export function shortReply(text: string, max = 90): { text: string; truncated: boolean } {
  const t = text.replace(/\s+/g, ' ').trim();
  const sentences = t.match(/[^。！？!?.…]+[。！？!?.…]*\s*/g) ?? [t];
  let out = '';
  let n = 0;
  for (const s of sentences) {
    if (Array.from(out + s).length > max) break;
    out += s;
    n += 1;
    // 最多两句；第一句已经够长就只要一句
    if (n >= 2 || Array.from(out).length >= max * 0.5) break;
  }
  out = out.trim();
  if (!out)
    out =
      Array.from(t)
        .slice(0, max - 1)
        .join('') + '…';
  return { text: out, truncated: out.length < t.length };
}
