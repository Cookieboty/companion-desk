import React from 'react';

import { cx } from './cx';

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
}

/** 分段式 Tabs（role=tablist / tab，←/→ 键切换）。内容区由调用方按 value 渲染。 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
  ...rest
}: TabsProps<T>) {
  const enabled = items.filter((i) => !i.disabled);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const idx = enabled.findIndex((i) => i.value === value);
    const next =
      enabled[(idx + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length];
    if (next) onChange(next.value);
  };
  return (
    <div role="tablist" className={cx('cd-tabs', className)} onKeyDown={onKey} {...rest}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={it.value === value}
          tabIndex={it.value === value ? 0 : -1}
          disabled={it.disabled}
          className="cd-tab"
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
