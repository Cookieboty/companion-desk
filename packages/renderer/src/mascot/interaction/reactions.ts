import { mascotRegistry } from '../MascotBackend';

import { reactionFor, type ReactionKind } from './gestures';
import type { BodyRegion } from './regions';
import { interactionSettings } from './settings';

const SPEAK_KINDS: ReactionKind[] = ['click', 'double', 'pat', 'land', 'grab'];
let token = 0;
let lastAt = 0;
const lastByKey = new Map<string, number>();

function speak(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.pitch = 1.3;
    u.volume = 0.8;
    synth.speak(u);
  } catch {
    /* 系统无语音引擎：只显示气泡 */
  }
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
  if (r.motion) backend?.playMotion(r.motion);
  if (r.lines.length) {
    const line = r.lines[Math.floor(Math.random() * r.lines.length)];
    window.dispatchEvent(new CustomEvent('mascot:say', { detail: { text: line } }));
    if (SPEAK_KINDS.includes(kind)) speak(line);
  }
  document.documentElement.dataset.mascotReaction = key;
  return true;
}
