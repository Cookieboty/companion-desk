import React, { useEffect, useId } from 'react';

import { cx } from './cx';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  /** 点击遮罩关闭（默认 true） */
  closeOnOverlay?: boolean;
  /** 关闭按钮的无障碍名称（默认「关闭」） */
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

/** 模态对话框：遮罩点击 / Esc 关闭，role="dialog" + aria-modal。 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  footer,
  size = 'md',
  closeOnOverlay = true,
  closeLabel = '关闭',
  className,
  bodyClassName,
  children,
  'data-testid': testId,
}) => {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="cd-modal-overlay" onClick={closeOnOverlay ? onClose : undefined}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        className={cx('cd-modal', size === 'lg' && 'cd-modal--lg', className)}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="cd-modal__header">
          <h2 id={titleId} className="cd-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="cd-btn cd-btn--ghost cd-btn--sm cd-icon-btn"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className={cx('cd-modal__body', bodyClassName)}>{children}</div>
        {footer != null && <div className="cd-modal__footer">{footer}</div>}
      </div>
    </div>
  );
};

export const Dialog = Modal;
