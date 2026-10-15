import { speakForActiveCharacter } from '../characterVoice';
import { mascotRegistry } from '../MascotBackend';

import { reactionFor, type ReactionKind } from './gestures';
import type { BodyRegion } from './regions';
import { interactionSettings } from './settings';

const SPEAK_KINDS: ReactionKind[] = ['click', 'double', 'pat', 'land', 'grab'];
let token = 0;
let lastAt = 0;
const lastByKey = new Map<string, number>();

function speak(text: string): void {
  speakForActiveCharacter(text);
}

/**
 * 执行一次互动反应：表情 + 动作 + 台词（气泡，点击类再朗读）。
 * cooldown：同一 (kind, region) 的最小间隔，避免悬停时刷屏。
 */
export function react(
  kind: ReactionKind,
  region: BodyRegion | 'any' = 'any',
  cooldownMs = 0,
): boolean {
  if (!interactionSettings.get().reactions) return false;
  const now = performance.now();
  const key = `${kind}:${region}`;
  // 点击类也有最小间隔（连点不会让她抽搐）
  const cd = Math.max(cooldownMs, kind === 'hover' ? 0 : 900);
  if (now - (lastByKey.get(key) ?? -Infinity) < cd) return false;
  // 悬停类反应之间至少隔 6s，且刚有任何反应时不打断
  if (kind === 'hover' && now - lastAt < 6000) return false;
  const r = reactionFor(kind, region);
  if (!r) return false;
  lastByKey.set(key, now);
  lastAt = now;
  const backend = mascotRegistry.current();
  const my = ++token;
  if (r.expression) {
    backend?.setExpression(r.expression);
    setTimeout(
      () => {
        if (token === my) mascotRegistry.current()?.setExpression('neutral');
      },
      (r.expressionHold ?? 2) * 1000,
    );
  }
  // 互动反应优先级 2：高于空闲 / 普通动作，低于任务事件
  if (r.motion) backend?.playMotion(r.motion, { priority: 2 });
  if (r.lines.length) {
    const line = r.lines[Math.floor(Math.random() * r.lines.length)];
    window.dispatchEvent(new CustomEvent('mascot:say', { detail: { text: line } }));
    if (SPEAK_KINDS.includes(kind)) speak(line);
  }
  document.documentElement.dataset.mascotReaction = key;
  return true;
}
