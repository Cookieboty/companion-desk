import React, { forwardRef } from 'react';

import { cx } from './cx';

export type ButtonVariant = 'secondary' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

const classes = (variant: ButtonVariant, size: ButtonSize, block?: boolean) =>
  cx(
    'cd-btn',
    variant !== 'secondary' && `cd-btn--${variant}`,
    size !== 'md' && `cd-btn--${size}`,
    block && 'cd-btn--block',
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(classes(variant, size, block), className)}
      {...rest}
    />
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'block'> {
  /** 无障碍名称；同时作为 title（悬停提示），除非显式传 title */
  label: string;
  icon: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, title, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx(classes(variant, size), 'cd-icon-btn', className)}
      {...rest}
    >
      {icon}
    </button>
  );
});
