import React, { forwardRef } from 'react';

import { cx } from './cx';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md';
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        'cd-input',
        size === 'sm' && 'cd-input--sm',
        invalid && 'cd-input--invalid',
        className,
      )}
      {...rest}
    />
  );
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx('cd-textarea', className)} {...rest} />;
});

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md';
  /** 简写：传 options 则自动渲染 <option>；也可以直接写 children */
  options?: SelectOption[];
}

/** 原生 <select> 外观统一（保留原生行为：键盘、无障碍、Playwright selectOption）。 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', options, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx('cd-select', size === 'sm' && 'cd-select--sm', className)}
      {...rest}
    >
      {options?.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
});
