import React from 'react';

import { cx } from './cx';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}) => (
  <div className={cx('cd-empty', className)} {...rest}>
    {icon != null && <div className="cd-empty__icon">{icon}</div>}
    <p className="cd-empty__title">{title}</p>
    {description != null && <p className="cd-empty__desc">{description}</p>}
    {action != null && <div className="cd-empty__action">{action}</div>}
  </div>
);
