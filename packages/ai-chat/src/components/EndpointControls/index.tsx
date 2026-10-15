/**
 * 输入栏左侧「端点控制组」：端点（后端）+ 该端点自己的供应商 / 模型。
 *
 * - Nomi：Nomi 自有供应商 / 模型切换（ProviderSwitcher）。
 * - Claude Code / Codex / dsh：只显示该后端自己的档案（CliProviderChip），绝不出现 Nomi 供应商。
 * 普通模式只有 Nomi，不显示端点切换。
 */
import React from 'react';

import { useHarnessTabs } from '../../contexts/HarnessTabsContext';
import { useChatMode } from '../../hooks/useChatMode';
import { useHarnessState } from '../../hooks/useHarnessState';
import { providerClientAvailable } from '../../services/providerClient';
import { BackendSwitcher } from '../BackendSwitcher';
import { CliProviderChip } from '../CliProviderChip';
import { ProviderSwitcher } from '../ProviderSwitcher';

export const EndpointControls: React.FC<{
  className?: string;
  onManageNomi: () => void;
  onManageCli: (backend: 'claude' | 'codex' | 'dsh') => void;
}> = ({ className, onManageNomi, onManageCli }) => {
  const { isDev } = useChatMode();
  const tabs = useHarnessTabs();
  const harness = useHarnessState();
  const backend = tabs.isCliTab && tabs.activeTab ? tabs.activeTab.backend : harness?.backend;
  const cli = isDev && backend && backend !== 'nomi' ? backend : null;
  return (
    <>
      {isDev && <BackendSwitcher />}
      {cli ? (
        <CliProviderChip backend={cli} className={className} onManage={() => onManageCli(cli)} />
      ) : (
        providerClientAvailable() && (
          <ProviderSwitcher className={className} onManage={onManageNomi} />
        )
      )}
    </>
  );
};
