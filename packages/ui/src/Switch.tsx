import React from 'react';

import { cx } from './cx';

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'children'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
}

/** role="switch" 开关；点击 / 空格 / 回车切换。 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled,
  className,
  ...rest
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-disabled={disabled || undefined}
    disabled={disabled}
    className={cx('cd-switch', className)}
    onClick={() => !disabled && onChange(!checked)}
    {...rest}
  >
    <span className="cd-switch__track" aria-hidden>
      <span className="cd-switch__thumb" />
    </span>
    {label != null && <span className="cd-switch__label">{label}</span>}
  </button>
);
