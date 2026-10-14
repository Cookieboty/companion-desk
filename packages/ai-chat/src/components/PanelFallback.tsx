import { LoadingState } from '@nomi-ai/ui';
import React from 'react';

/** 懒加载分区的占位（统一骨架屏）。 */
export const PanelFallback: React.FC = () => (
  <div style={{ padding: 24 }} data-testid="panel-fallback">
    <LoadingState rows={4} />
  </div>
);
