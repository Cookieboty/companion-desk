import { t } from '@nomi-ai/ui';
import React from 'react';

/** 懒加载分区的占位（加载中）。 */
export const PanelFallback: React.FC = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label={t('加载中…')}
    data-testid="panel-fallback"
    style={{ padding: 24, opacity: 0.6, fontSize: 13 }}
  >
    {t('加载中…')}
  </div>
);
