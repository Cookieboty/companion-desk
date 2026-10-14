/**
 * 对话后端切换：Nomi（默认）| Claude Code | Codex。
 * CLI 模式下禁用 Nomi 工具（由 harness + send 路径保证）。
 */
import { Select, t } from '@nomi-ai/ui';
import React, { useEffect, useState } from 'react';

import {
  harnessClient,
  type HarnessBackend,
  type HarnessState,
} from '../../services/harnessClient';

const LABELS: Record<HarnessBackend, () => string> = {
  nomi: () => t('Nomi'),
  claude: () => t('Claude Code'),
  codex: () => t('Codex'),
};

export const BackendSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const [state, setState] = useState<HarnessState | null>(null);
  const available = harnessClient.available();

  useEffect(() => {
    if (!available) return;
    void harnessClient
      .state()
      .then(setState)
      .catch(() => setState(null));
    return harnessClient.onChanged(setState);
  }, [available]);

  if (!available || !state) return null;

  return (
    <span
      className={className}
      data-testid="backend-switcher"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      title={t('切换对话后端（Claude / Codex 为 UI 转发）')}
    >
      <Select
        size="sm"
        style={{ width: 'auto', maxWidth: 160 }}
        data-testid="backend-switch"
        aria-label={t('对话后端')}
        value={state.backend}
        disabled={state.busy}
        onChange={(e) => {
          const v = e.target.value as HarnessBackend;
          void harnessClient
            .setBackend(v)
            .then(setState)
            .catch(() => undefined);
        }}
        options={(Object.keys(LABELS) as HarnessBackend[]).map((k) => ({
          value: k,
          label: LABELS[k](),
          description:
            k === 'nomi'
              ? t('自有 AI 与工具')
              : k === 'claude'
                ? state.bins.claude
                  ? t('转发到本机 Claude Code')
                  : t('未检测到 claude')
                : state.bins.codex
                  ? t('转发到本机 Codex')
                  : t('未检测到 codex'),
          disabled: k !== 'nomi' && !state.bins[k],
        }))}
      />
      {state.backend !== 'nomi' && (
        <button
          type="button"
          data-testid="harness-pick-cwd"
          className="cd-btn cd-btn-ghost"
          style={{ fontSize: 12 }}
          onClick={() => void harnessClient.pickCwd().then(setState)}
          title={state.cwd}
        >
          {t('目录')}
        </button>
      )}
      {state.toolsDisabled && (
        <span data-testid="harness-tools-off" style={{ fontSize: 11, opacity: 0.75 }}>
          {t('Nomi 工具已关闭')}
        </span>
      )}
    </span>
  );
};
