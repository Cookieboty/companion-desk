/**
 * 订阅额度卡片（尽力而为）。
 * 只展示主进程从本机已有数据里读到的额度；读不到就写「暂未返回可用额度」，不估算、不编造。
 * 读取订阅额度如果需要账号凭据或未公开接口，Nomi 不会去读（见底部说明）。
 */
import { Badge, t } from '@nomi-ai/ui';
import { Gauge } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import {
  USAGE_SOURCE_LABEL,
  usageClient,
  type UsageQuotaEntry,
  type UsageQuotaWindow,
} from '../../services/usageClient';
import { AppIcon } from '../AppIcons';
import { relTime } from '../CodingMonitor';

import { quotaWindowLabel, resetText } from './format';
import styles from './index.module.css';
import { SourceIcon } from './shared';

const nameOf = (e: UsageQuotaEntry) => {
  const k = USAGE_SOURCE_LABEL[e.id];
  return k ? t(k) : e.label;
};

const Window: React.FC<{ w: UsageQuotaWindow; now: number }> = ({ w, now }) => {
  const pct = Math.round(w.usedPercent);
  const tone = pct >= 90 ? styles.quotaHigh : pct >= 70 ? styles.quotaMid : '';
  return (
    <li className={styles.quotaWin} data-testid="usage-quota-window">
      <div className={styles.quotaWinHead}>
        <span>{quotaWindowLabel(w.id, w.windowMinutes)}</span>
        {w.expired ? (
          <span className={styles.dim}>{t('窗口已重置，下次使用后更新')}</span>
        ) : (
          <>
            <b>{t('已用 {0}%', pct)}</b>
            {w.resetAt ? <span className={styles.dim}>{resetText(w.resetAt, now)}</span> : null}
          </>
        )}
      </div>
      {!w.expired && (
        <div
          className={`${styles.quotaBar} ${tone}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={quotaWindowLabel(w.id, w.windowMinutes)}
        >
          <i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
        </div>
      )}
    </li>
  );
};

export const QuotaCard: React.FC = () => {
  const [rows, setRows] = useState<UsageQuotaEntry[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!usageClient.available()) return;
    let alive = true;
    const load = () =>
      void usageClient
        .quota()
        .then((r) => {
          if (!alive) return;
          setRows(r);
          setNow(Date.now());
        })
        .catch(() => alive && setRows([]));
    load();
    const off = usageClient.onChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!rows) return null;
  const ok = rows.filter((r) => r.status === 'ok');
  const none = rows.filter((r) => r.status !== 'ok');

  return (
    <section className={styles.panel} data-testid="usage-quota-card">
      <header className={styles.panelHead}>
        <h3>{t('订阅额度')}</h3>
        <Badge tone="neutral">{t('尽力而为')}</Badge>
        <AppIcon icon={Gauge} />
      </header>
      {ok.map((e) => (
        <div key={e.id} className={styles.quotaEntry} data-testid={`usage-quota-${e.id}`}>
          <div className={styles.quotaName}>
            <SourceIcon source={e.id} size={16} />
            <b>{nameOf(e)}</b>
            {e.plan ? <Badge tone="neutral">{e.plan}</Badge> : null}
            {e.updatedAt ? (
              <span className={styles.dim}>{t('更新于 {0}', relTime(e.updatedAt, now))}</span>
            ) : null}
          </div>
          <ul className={styles.quotaList}>
            {e.windows.map((w) => (
              <Window key={w.id} w={w} now={now} />
            ))}
          </ul>
        </div>
      ))}
      {none.map((e) => (
        <div
          key={e.id}
          className={styles.quotaNone}
          data-testid={`usage-quota-${e.id}`}
          data-status="unavailable"
        >
          <SourceIcon source={e.id} size={16} />
          <span>{nameOf(e)}</span>
          <span className={styles.dim}>{t('暂未返回可用额度')}</span>
        </div>
      ))}
      <p className={styles.dim}>
        {t(
          '额度只来自这台电脑上已有的数据（如 Codex 写在会话日志里的额度快照）。需要账号凭据或未公开接口才能读取的额度，Nomi 不会去读取，也不会估算。',
        )}
      </p>
    </section>
  );
};
