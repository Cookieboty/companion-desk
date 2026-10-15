/**
 * 「供应商」页：顶部端点切换（Nomi / Claude Code / Codex / dsh），每个端点一块完全独立的配置区。
 * - Nomi：自有 AI 的供应商 + 任务路由（对话 / 工具 / 摘要），存于 ai-providers.json。
 * - Claude Code / Codex / dsh：各自的档案库、写入位置、上游格式、本地路由（高级）。
 * 四套互不复用；切换端点只是换一个视图，不会改任何配置。
 */
import { t } from '@nomi-ai/ui';
import React from 'react';

import { useProviderEndpoint } from '../../hooks/useProviderEndpoint';
import { cliProviderClient } from '../../services/cliProviderClient';
import { providerClientAvailable } from '../../services/providerClient';
import { CONVERSATION_BACKENDS, type ConversationBackend } from '../../types/chat';
import { ENDPOINT_NAME } from '../../utils/endpointBadge';
import { EndpointIcon } from '../EndpointIcon';
import { ProviderPanel } from '../lazyPanels';

import { CliEndpointSection } from './CliEndpointSection';
import styles from './index.module.css';

const noop = () => undefined;

export const ProvidersPage: React.FC = () => {
  const [ep, setEp] = useProviderEndpoint();
  const nomiOk = providerClientAvailable();
  const cliOk = cliProviderClient.available();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = CONVERSATION_BACKENDS.indexOf(ep);
    const n = CONVERSATION_BACKENDS.length;
    setEp(CONVERSATION_BACKENDS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]!);
    e.preventDefault();
  };

  return (
    <div className={styles.page} data-testid="providers-page" data-endpoint={ep}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('供应商')}</h2>
        <p className={styles.sub}>
          {t(
            '每个端点有自己独立的供应商配置，互不复用；在这里切换只是换一个视图，不会改动任何配置。',
          )}
        </p>
        <div
          role="tablist"
          aria-label={t('选择端点')}
          className={styles.tabs}
          data-testid="providers-endpoint-tabs"
          onKeyDown={onKey}
        >
          {CONVERSATION_BACKENDS.map((b: ConversationBackend) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={ep === b}
              tabIndex={ep === b ? 0 : -1}
              className={`${styles.tab} ${ep === b ? styles.tabOn : ''}`}
              data-testid={`providers-endpoint-${b}`}
              onClick={() => setEp(b)}
            >
              <EndpointIcon backend={b} size={16} decorative />
              {t(ENDPOINT_NAME[b])}
            </button>
          ))}
        </div>
      </div>

      {ep === 'nomi' ? (
        <div data-testid="providers-section-nomi">
          <div className={styles.intro}>
            <p>
              {t(
                'Nomi 自有 AI 的供应商，配置存在 Nomi 自己的 ai-providers.json（密钥加密保存）。Claude Code / Codex / dsh 不会读取这里，这里也不会写它们的配置。',
              )}
            </p>
            <p>{t('任务路由（对话 / 工具 / 摘要）只属于 Nomi，在下方「任务路由」里设置。')}</p>
          </div>
          {nomiOk ? (
            <ProviderPanel isVisible onClose={noop} />
          ) : (
            <p className={styles.sub}>{t('供应商管理仅在桌面应用中可用；模型配置见「通用」。')}</p>
          )}
        </div>
      ) : cliOk ? (
        <CliEndpointSection key={ep} kind={ep} />
      ) : (
        <p className={styles.sub}>{t('编程助手接入需要在桌面应用中使用')}</p>
      )}
    </div>
  );
};
