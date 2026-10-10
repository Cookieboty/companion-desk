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

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';
