import { toErrorHint, type ErrorAction } from '@ig-live/ai-sdk-client';
import React from 'react';

import styles from './index.module.css';

interface ErrorHintProps {
  error: unknown;
  onAction?: (action: ErrorAction['kind']) => void;
  onDismiss?: () => void;
}

export const ErrorHint: React.FC<ErrorHintProps> = ({ error, onAction, onDismiss }) => {
  if (error === null || error === undefined || error === '') return null;
  const hint = toErrorHint(error instanceof Error ? error : new Error(String(error)));

  const handleAction = () => {
    if (!hint.action) return;
    if (hint.action.kind === 'dismiss') {
      onDismiss?.();
      return;
    }
    onAction?.(hint.action.kind);
  };

  return (
    <div className={styles.errorHint} role="alert" data-code={hint.code}>
      <div className={styles.errorHintHeader}>
        <span className={styles.errorHintIcon} aria-hidden>
          ⚠️
        </span>
        <strong className={styles.errorHintTitle}>{hint.title}</strong>
        {onDismiss && (
          <button
            type="button"
            className={styles.errorHintDismiss}
            aria-label="关闭错误提示"
            onClick={onDismiss}
          >
            ×
          </button>
        )}
      </div>
      <p className={styles.errorHintDesc}>{hint.description}</p>
      {hint.action && (
        <div className={styles.errorHintActions}>
          <button type="button" className={styles.errorHintCta} onClick={handleAction}>
            {hint.action.label}
          </button>
        </div>
      )}
    </div>
  );
};
