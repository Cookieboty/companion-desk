import React from 'react';

import { cx } from './cx';

export interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

/** 行内提示条（面板顶部的说明 / 警告 / 错误）。 */
export const Notice: React.FC<NoticeProps> = ({ tone = 'info', className, ...rest }) => (
  <div
    role={tone === 'danger' ? 'alert' : undefined}
    className={cx('cd-notice', tone !== 'info' && `cd-notice--${tone}`, className)}
    {...rest}
  />
);
