/**
 * 工具栏上的 provider 一键切换（与托盘菜单、面板共享主进程状态，实时同步）。
 */
import React, { useEffect, useState } from 'react';

import {
  providerClient,
  providerClientAvailable,
  selectableProviders,
  type ProviderState,
} from '../../services/providerClient';

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
  return (
    <span className={className} data-testid="provider-switcher">
      Provider:{' '}
      <select
        data-testid="provider-switch"
        value={state.effectiveProviderId ?? ''}
        disabled={Boolean(state.overrideId)}
        title={state.overrideId ? '已被 COMPANION_PROVIDER 锁定' : '切换 AI provider'}
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
      </select>{' '}
      <button
        type="button"
        data-testid="open-provider-panel"
        onClick={onManage}
        title="Provider 与 Token 管理"
      >
        🔑
      </button>
    </span>
  );
};
