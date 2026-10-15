/**
 * 跨端分叉：选择目标后端。
 */
import { t } from '@nomi-ai/ui';
import React, { useEffect, useState } from 'react';

import { harnessClient } from '../../services/harnessClient';
import type { ConversationBackend } from '../../types/chat';
import { CONVERSATION_BACKENDS } from '../../types/chat';
import { ENDPOINT_FULL, ENDPOINT_SHORT } from '../../utils/endpointBadge';

import styles from './index.module.css';

export const ForkTargetMenu: React.FC<{
  open: boolean;
  current: ConversationBackend;
  onPick: (b: ConversationBackend) => void;
  onClose: () => void;
}> = ({ open, current, onPick, onClose }) => {
  const [bins, setBins] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!open) return;
    void harnessClient
      .state()
      .then((s) => setBins(s.bins))
      .catch(() => undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} data-testid="fork-target-menu" onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('分叉到其他端')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>{t('分叉到其他端')}</div>
        <p className={styles.hint}>
          {t('复制可见对话到新会话。跨 CLI 仅作上下文参考，不能续接原会话。')}
        </p>
        <div className={styles.list}>
          {CONVERSATION_BACKENDS.filter((b) => b !== current).map((b) => {
            const missing = b !== 'nomi' && !bins[b];
            return (
              <button
                key={b}
                type="button"
                className={styles.item}
                disabled={missing}
                data-testid={`fork-target-${b}`}
                onClick={() => onPick(b)}
              >
                <span className={styles.badge} data-ep={b}>
                  {ENDPOINT_SHORT[b]}
                </span>
                <span>{ENDPOINT_FULL[b]()}</span>
                {missing && <span className={styles.miss}>{t('未安装')}</span>}
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.cancel} onClick={onClose}>
          {t('取消')}
        </button>
      </div>
    </div>
  );
};
