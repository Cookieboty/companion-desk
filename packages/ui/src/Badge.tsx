import React from 'react';

import { cx } from './cx';

export type BadgeTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  outline?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'accent', outline, className, ...rest }) => (
  <span
    className={cx(
      'cd-badge',
      tone !== 'accent' && `cd-badge--${tone}`,
      outline && 'cd-badge--outline',
      className,
    )}
    {...rest}
  />
);

export const Tag = Badge;
