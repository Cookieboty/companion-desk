import { MASCOT_EXPRESSIONS, type MascotExpression } from './MascotBackend';
import { applyDirective, playMotionNow } from './mood';

/** 主进程（AI 工具 / 托盘）或渲染进程内部发来的看板娘指令 */
export type MascotCommand =
  | { type: 'motion'; name: string }
  | { type: 'expression'; name: string }
  | { type: 'open-picker' }
  | { type: 'select-model'; id: string }
  | { type: string; [k: string]: unknown };

/** 执行指令；返回是否被识别并执行。 */
export function handleMascotCommand(raw: unknown): boolean {
  const cmd = raw as MascotCommand | null;
  if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return false;
  switch (cmd.type) {
    case 'motion':
      return typeof cmd.name === 'string' && playMotionNow(cmd.name);
    case 'expression': {
      const name = String(cmd.name ?? '').toLowerCase() as MascotExpression;
      if (!MASCOT_EXPRESSIONS.includes(name)) return false;
      applyDirective({ expression: name, holdMs: name === 'neutral' ? 0 : 5000 });
      return true;
    }
    case 'select-model':
      if (typeof cmd.id !== 'string') return false;
      window.dispatchEvent(new CustomEvent('mascot:select-model', { detail: { id: cmd.id } }));
      return true;
    case 'open-picker':
      window.dispatchEvent(new CustomEvent('mascot:open-picker'));
      return true;
    default:
      return false;
  }
}
