/**
 * 端点页的「版本」卡片：已装版本 / 最新版本 / 检查更新 / 一键更新；未安装时一键安装。
 * 执行前一定弹出确认框，展示确切命令与前置检查（Node / npm / 写权限）；
 * 没有写权限时不会偷偷提权，只提供「改装到用户目录」或自行在终端处理。
 * 进度与日志来自主进程按行推送的事件；失败原因原样展示。
 */
import { Button, Modal, Notice, t } from '@nomi-ai/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  cliUpdateClient,
  type CliInstallInfo,
  type CliInstallPlan,
  type CliInstallScope,
  type CliRunResult,
  type CliUpdatableKind,
} from '../../services/cliUpdateClient';

import styles from './index.module.css';

const NAME: Record<CliUpdatableKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  dsh: 'dsh',
};

export type VersionState = 'missing' | 'outdated' | 'current' | 'unknown';

/** 纯函数：版本状态（便于测试） */
export function versionState(info: CliInstallInfo | null): VersionState {
  if (!info || !info.path) return info ? 'missing' : 'unknown';
  if (info.updateAvailable) return 'outdated';
  return info.version && info.latest ? 'current' : 'unknown';
}

export const CliVersionCard: React.FC<{ kind: CliUpdatableKind }> = ({ kind }) => {
  const [info, setInfo] = useState<CliInstallInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [plan, setPlan] = useState<CliInstallPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<CliRunResult | null>(null);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  const load = useCallback(
    async (refreshLatest: boolean) => {
      setChecking(true);
      setError('');
      try {
        const rows = await cliUpdateClient.inspect(refreshLatest);
        setInfo(Array.isArray(rows) ? (rows.find((r) => r.kind === kind) ?? null) : null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChecking(false);
      }
    },
    [kind],
  );

  useEffect(() => {
    setInfo(null);
    setResult(null);
    setLines([]);
    void load(false);
    return cliUpdateClient.onEvent((e) => {
      if (e.kind !== kind) return;
      if (e.phase === 'start') setLines([]);
      if (e.phase === 'log') setLines((l) => [...l.slice(-200), e.line]);
    });
  }, [kind, load]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const state = versionState(info);
  const name = NAME[kind];

  const openPlan = async (scope: CliInstallScope = 'global') => {
    setError('');
    setResult(null);
    try {
      setPlan(await cliUpdateClient.preview(kind, scope));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirm = async () => {
    if (!plan || plan.blockers.length) return;
    const scope = plan.scope;
    setPlan(null);
    setRunning(true);
    setLines([]);
    try {
      const r = await cliUpdateClient.run(kind, scope);
      setResult(r);
      await load(true);
    } catch (e) {
      setResult({ ok: false, log: e instanceof Error ? e.message : String(e), version: null });
    } finally {
      setRunning(false);
    }
  };

  const statusText =
    state === 'missing'
      ? t('未安装')
      : state === 'outdated'
        ? t('有新版本')
        : state === 'current'
          ? t('已是最新')
          : t('已安装');

  const actionLabel =
    state === 'missing'
      ? t('一键安装')
      : state === 'outdated'
        ? t('更新到 {0}', info?.latest ?? '')
        : t('重新安装最新版');

  return (
    <section className={styles.card} data-testid={`cli-version-card-${kind}`}>
      <h3 className={styles.cardTitle}>{t('版本')}</h3>
      <div className={styles.verRow}>
        <dl className={styles.verFacts}>
          <dt>{t('状态')}</dt>
          <dd data-testid={`cli-version-state-${kind}`} data-state={state}>
            {statusText}
          </dd>
          <dt>{t('已装版本')}</dt>
          <dd data-testid={`cli-version-installed-${kind}`}>{info?.version ?? '—'}</dd>
          <dt>{t('最新版本')}</dt>
          <dd data-testid={`cli-version-latest-${kind}`}>{info?.latest ?? '—'}</dd>
          {info?.path && (
            <>
              <dt>{t('位置')}</dt>
              <dd>{info.path}</dd>
            </>
          )}
        </dl>
        <div className={styles.verActions}>
          <Button
            size="sm"
            disabled={checking || running}
            data-testid={`cli-version-check-${kind}`}
            onClick={() => void load(true)}
          >
            {checking ? t('检查中…') : t('检查更新')}
          </Button>
          <Button
            size="sm"
            variant={state === 'missing' || state === 'outdated' ? 'primary' : 'secondary'}
            disabled={checking || running || !info}
            data-testid={`cli-version-action-${kind}`}
            onClick={() => void openPlan()}
          >
            {running ? t('进行中…') : actionLabel}
          </Button>
        </div>
      </div>

      {info?.runtimeWarning && (
        <Notice tone="warning" data-testid={`cli-runtime-warning-${kind}`}>
          {t(
            'dsh 需要 Node ≥ {0}，当前 PATH 上的 Node 为 {1}；升级 Node 后才能接管 dsh。',
            info.runtimeWarning.required,
            info.runtimeWarning.nodeVersion ?? t('未找到'),
          )}
        </Notice>
      )}
      {error && (
        <Notice tone="danger" data-testid={`cli-version-error-${kind}`}>
          {error}
        </Notice>
      )}
      {(running || lines.length > 0) && (
        <pre
          ref={logRef}
          className={styles.logBox}
          role="log"
          aria-live="polite"
          data-testid={`cli-version-log-${kind}`}
        >
          {lines.join('\n') || t('正在执行…')}
        </pre>
      )}
      {result && (
        <Notice
          tone={result.ok ? 'success' : 'danger'}
          data-testid={`cli-version-result-${kind}`}
          data-ok={result.ok ? '1' : '0'}
        >
          {result.ok
            ? t('{0} 已就绪，版本 {1}。', name, result.version ?? '—')
            : t('{0} 没有安装 / 更新成功：', name)}
          {result.note ? ` ${result.note}` : ''}
          {!result.ok && result.log ? <pre className={styles.logBox}>{result.log}</pre> : null}
        </Notice>
      )}

      <Modal
        open={Boolean(plan)}
        onClose={() => setPlan(null)}
        title={plan?.mode === 'install' ? t('安装 {0}', name) : t('更新 {0}', name)}
        data-testid={`cli-version-dialog-${kind}`}
        footer={
          <>
            <Button size="sm" onClick={() => setPlan(null)} data-testid="cli-version-cancel">
              {t('取消')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!plan || plan.blockers.length > 0}
              onClick={() => void confirm()}
              data-testid="cli-version-confirm"
            >
              {plan?.mode === 'install' ? t('确认安装') : t('确认更新')}
            </Button>
          </>
        }
      >
        {plan && (
          <div style={{ display: 'grid', gap: 8 }}>
            <span>{t('将在本机执行以下命令（不会使用 sudo / 管理员权限）：')}</span>
            <code className={styles.cmd} data-testid="cli-version-command">
              {plan.command}
            </code>
            {plan.requirements.length > 0 && (
              <ul className={styles.reqList} aria-label={t('前置检查')}>
                {plan.requirements.map((r) => (
                  <li
                    key={r.id}
                    className={r.ok ? styles.reqOk : styles.reqBad}
                    data-testid={`cli-version-req-${r.id}`}
                    data-ok={r.ok ? '1' : '0'}
                  >
                    {r.label} — {r.detail}
                  </li>
                ))}
              </ul>
            )}
            {plan.blockers.map((b) => (
              <Notice key={b} tone="danger" data-testid="cli-version-blocker">
                {b}
              </Notice>
            ))}
            {plan.userScopeCommand && plan.scope === 'global' && (
              <div style={{ display: 'grid', gap: 6 }}>
                <span>{t('或者改装到你的用户目录（不需要管理员权限）：')}</span>
                <code className={styles.cmd}>{plan.userScopeCommand}</code>
                <div>
                  <Button
                    size="sm"
                    data-testid="cli-version-user-scope"
                    onClick={() => void openPlan('user')}
                  >
                    {t('改用用户目录安装')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
};
