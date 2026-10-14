import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** 打开中的对话框栈：Esc / 焦点陷阱只作用于最上层。 */
const stack: HTMLElement[] = [];

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
      (typeof el.checkVisibility !== 'function' || el.checkVisibility()),
  );
}

/**
 * 对话框焦点管理：
 * - 打开时把焦点移入（优先 [data-autofocus]，其次第一个可聚焦元素，否则对话框本身）；
 * - Tab / Shift+Tab 在对话框内循环；
 * - Esc 只关闭最上层对话框；
 * - 关闭后把焦点还给打开前的元素。
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
): void {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const prev = document.activeElement as HTMLElement | null;
    stack.push(root);
    if (!root.contains(document.activeElement)) {
      const first =
        root.querySelector<HTMLElement>('[data-autofocus]') ??
        focusables(root).find((el) => !el.matches('.cd-modal__header button')) ??
        focusables(root)[0];
      if (first) first.focus({ preventScroll: true });
      else {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
        root.focus({ preventScroll: true });
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== root) return;
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables(root);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const cur = document.activeElement as HTMLElement | null;
      if (!cur || !root.contains(cur)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && cur === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // 捕获阶段：先于页面其他快捷键处理（Esc 不会同时触发底层的关闭逻辑）
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const i = stack.lastIndexOf(root);
      if (i >= 0) stack.splice(i, 1);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
    // onEscape 每次渲染都可能是新函数；只在开关时重建
  }, [active, ref]);
}
