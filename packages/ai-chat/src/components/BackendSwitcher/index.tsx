/**
 * 对话后端切换：Nomi（默认）| Claude Code | Codex | dsh。
 * CLI 模式下禁用 Nomi 工具（由 harness + send 路径保证）。
 * 当前为独立 CLI 标签时，切换的是该标签的后端（不含 Nomi）。
 */
import { Select, t } from '@nomi-ai/ui';
import React, { useEffect, useState } from 'react';

import { useHarnessTabs } from '../../contexts/HarnessTabsContext';
import {
  harnessClient,
  type HarnessBackend,
  type HarnessState,
} from '../../services/harnessClient';

const LABELS: Record<HarnessBackend, () => string> = {
  nomi: () => t('Nomi'),
  claude: () => t('Claude Code'),
  codex: () => t('Codex'),
  dsh: () => 'dsh',
};

export const BackendSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const [state, setState] = useState<HarnessState | null>(null);
  const available = harnessClient.available();
  const tabs = useHarnessTabs();

  useEffect(() => {
    if (!available) return;
    void harnessClient
      .state()
      .then(setState)
      .catch(() => setState(null));
    return harnessClient.onChanged(setState);
  }, [available]);

  if (!available || !state) return null;

  const tab = tabs.isCliTab ? tabs.activeTab : null;
  const value: HarnessBackend = tab ? tab.backend : state.backend;
  const busy = tab ? tab.status === 'running' || tab.status === 'queued' : state.busy;

  return (
    <span
      className={className}
      data-testid="backend-switcher"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      title={t('切换对话后端（Claude / Codex / dsh 为 UI 转发）')}
    >
      <Select
        size="sm"
        style={{ width: 'auto', maxWidth: 160 }}
        data-testid="backend-switch"
        aria-label={t('对话后端')}
        value={value}
        disabled={busy}
        onChange={(e) => {
          const v = e.target.value as HarnessBackend;
          if (tab) {
            void harnessClient.setTabBackend(tab.id, v).catch(() => undefined);
            return;
          }
          void harnessClient
            .setBackend(v)
            .then(setState)
            .catch(() => undefined);
        }}
        options={(Object.keys(LABELS) as HarnessBackend[])
          .filter((k) => !tab || k !== 'nomi')
          .map((k) => ({
            value: k,
            label: LABELS[k](),
            description:
              k === 'nomi'
                ? t('自有 AI 与工具')
                : k === 'claude'
                  ? state.bins.claude
                    ? t('转发到本机 Claude Code')
                    : t('未检测到 claude')
                  : k === 'codex'
                    ? state.bins.codex
                      ? t('转发到本机 Codex')
                      : t('未检测到 codex')
                    : state.bins.dsh
                      ? t('转发到本机 dsh')
                      : t('未检测到 dsh'),
            disabled: k !== 'nomi' && !state.bins[k],
          }))}
      />
      {!tab && state.backend !== 'nomi' && (
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
      {(tab || state.toolsDisabled) && (
        <span data-testid="harness-tools-off" style={{ fontSize: 11, opacity: 0.75 }}>
          {t('Nomi 工具已关闭')}
        </span>
      )}
    </span>
  );
};
