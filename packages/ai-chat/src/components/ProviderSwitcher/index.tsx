/**
 * 工具栏上的 provider 一键切换（与托盘菜单、面板共享主进程状态，实时同步）。
 */
import { IconButton, Select } from '@ig-live/ui';
import React, { useEffect, useState } from 'react';

import {
  providerClient,
  providerClientAvailable,
  selectableModels,
  selectableProviders,
  type ProviderState,
} from '../../services/providerClient';

const SWITCHER_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--cd-space-1)',
};

export const ProviderSwitcher: React.FC<{ onManage: () => void; className?: string }> = ({
  onManage,
  className,
}) => {
  const [state, setState] = useState<ProviderState | null>(null);
  const available = providerClientAvailable();

  useEffect(() => {
    if (!available) return;
    providerClient
      .state()
      .then(setState)
      .catch(() => setState(null));
    return providerClient.onChanged(setState);
  }, [available]);

  if (!available || !state) return null;
  const options = selectableProviders(state);
  const current = state.effectiveProviderId;
  const models = selectableModels(state, current);
  const model = state.effectiveModel ?? models[0] ?? '';
  return (
    <span className={className} data-testid="provider-switcher" style={SWITCHER_STYLE}>
      <Select
        size="sm"
        style={{ width: 'auto', maxWidth: 200 }}
        data-testid="provider-switch"
        aria-label="供应商"
        value={current ?? ''}
        disabled={Boolean(state.overrideId)}
        title={state.overrideId ? '已被 COMPANION_PROVIDER 锁定' : '切换供应商（立即生效）'}
        onChange={(e) =>
          void providerClient.setActive(e.target.value || null).catch(() => undefined)
        }
      >
        {options.length === 0 && <option value="">（未配置）</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </Select>
      <Select
        size="sm"
        style={{ width: 'auto', maxWidth: 220 }}
        data-testid="model-switch"
        aria-label="模型"
        title="切换模型（立即生效）"
        value={model}
        disabled={!current || Boolean(state.overrideId) || models.length === 0}
        onChange={(e) =>
          current && void providerClient.setActive(current, e.target.value).catch(() => undefined)
        }
      >
        {models.length === 0 && <option value="">（默认）</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
      <IconButton
        size="sm"
        data-testid="open-provider-panel"
        onClick={onManage}
        label="供应商与 Token 管理"
        icon="🔑"
      />
    </span>
  );
};
