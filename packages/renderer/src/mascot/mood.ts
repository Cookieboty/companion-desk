import type { ExpressionDirective } from './expressionDirector';
import { mascotRegistry } from './MascotBackend';

let revertTimer: ReturnType<typeof setTimeout> | null = null;

/** 应用一条表情指令：设置表情，holdMs 后回到 neutral。 */
export function applyDirective(d: ExpressionDirective | null): void {
  if (!d) return;
  const backend = mascotRegistry.current();
  if (!backend) return;
  if (revertTimer) clearTimeout(revertTimer);
  revertTimer = null;
  backend.setExpression(d.expression);
  if (d.holdMs > 0) {
    revertTimer = setTimeout(() => {
      mascotRegistry.current()?.setExpression('neutral');
      revertTimer = null;
    }, d.holdMs);
  }
}
