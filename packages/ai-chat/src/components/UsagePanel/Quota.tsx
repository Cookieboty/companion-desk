/**
 * 订阅额度卡片（尽力而为）。
 * 只对「订阅 / 账号登录」的工具显示额度；API Key / 第三方供应商 / 本地路由的工具只标「API 计费，无订阅额度」，
 * Nomi 对话走 API，不出现在这里。额度只来自本机已有的数据（Codex 的会话日志、Claude Code 官方 statusline
 * 输入里的 rate_limits，后者需要用户在这里主动开启）；读不到就写「暂未返回可用额度」，不估算、不编造。
 * 登录方式由主进程用官方「登录状态」命令 / 本地配置判断，不读取任何凭据。
 */
import { Badge, Button, t } from '@nomi-ai/ui';
import { Gauge } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import {
  USAGE_SOURCE_LABEL,
  usageClient,
  type UsageQuotaEntry,
  type UsageQuotaHook,
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

/** Claude Code 的额度只出现在它的 statusline 输入里：这里让用户自己决定要不要开启本地快照 */
const ClaudeHook: React.FC<{
  hook: UsageQuotaHook;
  busy: boolean;
  err: string | null;
  onToggle: (on: boolean) => void;
}> = ({ hook, busy, err, onToggle }) => (
  <div className={styles.quotaHook} data-testid="usage-quota-hook">
    {!hook.supported ? (
      <p className={styles.dim}>
        {t(
          '暂不支持在 Windows 上自动开启。可以在 Claude Code 的 statusLine 脚本里把 stdin 的 rate_limits 写到本地文件。',
        )}
      </p>
    ) : hook.problem ? (
      <p className={styles.err}>
        {hook.problem === 'invalid-settings'
          ? t('~/.claude/settings.json 不是合法的 JSON，为避免弄坏它，Nomi 没有改动。')
          : t('你已经配置了非命令类型的 statusLine，Nomi 不会覆盖它。')}
      </p>
    ) : hook.enabled ? (
      <>
        <p className={styles.dim}>
          {hook.hasSnapshot
            ? t('已开启状态栏快照：额度来自 Claude Code 每次回复后给状态栏的数据。')
            : t('已开启状态栏快照：等 Claude Code 完成一次回复后，这里就会出现额度。')}
          {hook.hadOwnStatusLine && <> {t('你原来的状态栏命令照常运行。')}</>}
        </p>
        <div>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onToggle(false)}
            data-testid="usage-hook-off"
          >
            {t('关闭并恢复原配置')}
          </Button>
        </div>
      </>
    ) : (
      <>
        <p className={styles.dim}>
          {t(
            'Claude Code 的 5 小时 / 每周额度不会写进会话日志，只出现在它给状态栏的数据里（官方文档，需 Pro / Max 订阅）。可以选择开启：Nomi 在 ~/.claude/settings.json 接入一个本地小脚本，把这份数据存成一个本机文件；你原来的状态栏命令照常运行，随时可关闭恢复。不读取凭据，不联网。',
          )}
        </p>
        <div>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onToggle(true)}
            data-testid="usage-hook-on"
          >
            {t('开启 Claude Code 额度同步')}
          </Button>
        </div>
      </>
    )}
    {err && <p className={styles.err}>{err}</p>}
  </div>
);

export const QuotaCard: React.FC = () => {
  const [rows, setRows] = useState<UsageQuotaEntry[] | null>(null);
  const [hook, setHook] = useState<UsageQuotaHook | null>(null);
  const [hookBusy, setHookBusy] = useState(false);
  const [hookErr, setHookErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    () =>
      usageClient
        .quota()
        .then((r) => {
          setRows(r);
          setNow(Date.now());
          // 只有 Claude Code 是订阅登录时才需要钩子状态
          if (r.some((e) => e.id === 'claude' && (e.auth ?? 'subscription') === 'subscription'))
            return usageClient.quotaHook().then(setHook);
          setHook(null);
        })
        .catch(() => setRows([])),
    [],
  );

  useEffect(() => {
    if (!usageClient.available()) return;
    let alive = true;
    const run = () => {
      if (alive) void load();
    };
    run();
    const off = usageClient.onChanged(run);
    // statusline 快照由 Claude Code 在后台写入，没有事件通知，轮询一下
    const timer = setInterval(run, 30_000);
    return () => {
      alive = false;
      off();
      clearInterval(timer);
    };
  }, [load]);

  const toggle = (on: boolean) => {
    setHookBusy(true);
    setHookErr(null);
    usageClient
      .setQuotaHook(on)
      .then((h) => {
        setHook(h);
        return load();
      })
      .catch((e: unknown) => setHookErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setHookBusy(false));
  };

  if (!rows) return null;
  const sub = rows.filter((r) => r.status !== 'api' && (r.auth ?? 'subscription') !== 'api');
  const ok = sub.filter((r) => r.status === 'ok');
  const none = sub.filter((r) => r.status !== 'ok');
  const api = rows.filter((r) => r.status === 'api');

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
      {hook && sub.some((e) => e.id === 'claude') && (
        <ClaudeHook hook={hook} busy={hookBusy} err={hookErr} onToggle={toggle} />
      )}
      {api.map((e) => (
        <div
          key={e.id}
          className={styles.quotaNone}
          data-testid={`usage-quota-${e.id}`}
          data-status="api"
        >
          <SourceIcon source={e.id} size={16} />
          <span>{nameOf(e)}</span>
          <span className={styles.dim}>{t('API 计费，无订阅额度')}</span>
        </div>
      ))}
      {ok.length + none.length + api.length === 0 && (
        <p className={styles.dim} data-testid="usage-quota-empty">
          {t('没有检测到以账号 / 订阅登录的编程工具。')}
        </p>
      )}
      <p className={styles.dim}>
        {t(
          '只有以账号 / 订阅登录的工具才有额度；用 API Key、第三方供应商或本地路由的工具（包括 Nomi 对话）按量计费，只统计用量与费用。额度只来自这台电脑上已有的数据，登录方式也只看官方的登录状态，Nomi 不读取任何账号凭据，也不调用未公开接口或估算。',
        )}
      </p>
    </section>
  );
};
