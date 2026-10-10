import React from 'react';

import { cx } from './cx';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  active?: boolean;
  flat?: boolean;
}

/** 玻璃拟态卡片 / 面板。title/subtitle/actions 均可选。 */
export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  actions,
  active,
  flat,
  className,
  children,
  ...rest
}) => {
  const hasHead = title != null || subtitle != null || actions != null;
  return (
    <div
      className={cx('cd-card', active && 'cd-card--active', flat && 'cd-card--flat', className)}
      {...rest}
    >
      {hasHead && (
        <div className="cd-card__head">
          <div>
            {title != null && <div className="cd-card__title">{title}</div>}
            {subtitle != null && <div className="cd-card__subtitle">{subtitle}</div>}
          </div>
          {actions != null && <div className="cd-card__actions">{actions}</div>}
        </div>
      )}
      {children != null && (hasHead ? <div className="cd-card__body">{children}</div> : children)}
    </div>
  );
};

export const Panel = Card;
