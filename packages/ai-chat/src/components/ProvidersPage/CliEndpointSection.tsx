/**
 * 单个 CLI 端点（Claude Code / Codex / dsh）的供应商配置区：
 * 说明（写到哪里、与其它端点独立）→ 当前状态（来源 / 格式 / 模型 / 路由）→ 档案列表
 * （启用 / 测速 / 编辑 / 删除）→ 添加或编辑档案 →「高级」（本地路由、存储路径）。
 */
import { Button, Notice, Select, t } from '@nomi-ai/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  cliProviderClient,
  cliRouteClient,
  type ClaudeApiFormat,
  type CliProfileTestResult,
  type CliProviderKind,
  type CliProviderProfile,
  type CliProviderState,
  type CliRouteSettings,
  type CodexApiFormat,
} from '../../services/cliProviderClient';
import { EndpointIcon } from '../EndpointIcon';

import styles from './index.module.css';

type Fmt = ClaudeApiFormat | CodexApiFormat;

const FORMATS: Record<CliProviderKind, Array<{ value: Fmt; label: string }>> = {
  claude: [
    { value: 'anthropic_messages', label: 'Anthropic Messages（原生）' },
    { value: 'openai_chat_completions', label: 'OpenAI Chat Completions（需开启路由）' },
    { value: 'openai_responses', label: 'OpenAI Responses API（需开启路由）' },
    { value: 'gemini_generate_content', label: 'Gemini Native generateContent（需开启路由）' },
  ],
  codex: [
    { value: 'openai_responses', label: 'Responses（原生）' },
    { value: 'openai_chat_completions', label: 'Chat Completions（需开启路由）' },
    { value: 'anthropic_messages', label: 'Anthropic Messages（需开启路由）' },
  ],
  dsh: [
    { value: 'openai_chat_completions', label: 'OpenAI Chat Completions（原生）' },
    { value: 'openai_responses', label: 'OpenAI Responses（原生）' },
    { value: 'anthropic_messages', label: 'Anthropic Messages（原生）' },
  ],
};
const DEFAULT_FORMAT: Record<CliProviderKind, Fmt> = {
  claude: 'anthropic_messages',
  codex: 'openai_responses',
  dsh: 'openai_chat_completions',
};
const NAME: Record<CliProviderKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  dsh: 'dsh',
};

export function formatLabel(kind: CliProviderKind, f: string): string {
  const hit = FORMATS[kind].find((x) => x.value === f)?.label ?? f;
  return t(hit)
    .replace(/[（(](原生|需开启路由|native|requires routing)[）)]/i, '')
    .trim();
}

/** 路由状态与原因（纯函数，便于测试） */
export function routingStatus(
  kind: CliProviderKind,
  active: CliProviderProfile | null,
  route: CliRouteSettings | null,
): { mode: 'none' | 'direct' | 'routed' | 'blocked' | 'n/a'; text: string } {
  if (kind === 'dsh') return { mode: 'n/a', text: t('无需路由：dsh 原生支持三种上游协议') };
  if (!active) return { mode: 'none', text: t('—（沿用 CLI 自带配置，不经过 Nomi）') };
  if (!active.needsRouting) {
    return {
      mode: 'direct',
      text: t(
        '直连：上游格式「{0}」是 {1} 的原生格式，无需路由',
        formatLabel(kind, active.apiFormat),
        NAME[kind],
      ),
    };
  }
  const on = Boolean(route?.enabled && route[kind]);
  return on
    ? {
        mode: 'routed',
        text: t(
          '已开启本地路由：上游格式「{0}」不是 {1} 的原生格式，经本机 {2} 转换后再转发',
          formatLabel(kind, active.apiFormat),
          NAME[kind],
          route?.listenUrl ?? '127.0.0.1',
        ),
      }
    : {
        mode: 'blocked',
        text: t(
          '需要本地路由但尚未开启：上游格式「{0}」不是 {1} 的原生格式（在「高级」里开启）',
          formatLabel(kind, active.apiFormat),
          NAME[kind],
        ),
      };
}

export const CliEndpointSection: React.FC<{ kind: CliProviderKind }> = ({ kind }) => {
  const [state, setState] = useState<CliProviderState | null>(null);
  const [route, setRoute] = useState<CliRouteSettings | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiFormat, setApiFormat] = useState<string>(DEFAULT_FORMAT[kind]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<Record<string, CliProfileTestResult | 'pending'>>({});

  const refresh = useCallback(() => {
    void cliProviderClient
      .state()
      .then((s) => {
        setState(s);
        setRoute(s.routing);
      })
      .catch(() => setState(null));
  }, []);
  useEffect(() => {
    refresh();
    return cliProviderClient.onChanged((s) => {
      setState(s);
      setRoute(s.routing);
    });
  }, [refresh]);

  const profiles = useMemo(
    () => (state?.profiles ?? []).filter((p) => p.kind === kind),
    [state, kind],
  );
  const active = profiles.find((p) => p.active) ?? null;
  const writes =
    kind === 'claude'
      ? state?.claudeSettings
      : kind === 'codex'
        ? state?.codexConfig
        : state?.dshConfig;
  const store =
    kind === 'claude' ? state?.claudeStore : kind === 'codex' ? state?.codexStore : state?.dshStore;
  const rs = routingStatus(kind, active, route);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setBaseUrl('');
    setModel('');
    setApiKey('');
    setApiFormat(DEFAULT_FORMAT[kind]);
  };

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    guard(async () => {
      await cliProviderClient.upsert({
        id: editingId ?? undefined,
        kind,
        name: name || NAME[kind],
        baseUrl,
        model,
        apiFormat: apiFormat as Fmt,
        apiKey: apiKey || undefined,
      });
      setMsg(editingId ? t('已更新档案') : t('已保存档案'));
      resetForm();
      refresh();
    });

  const activate = (p: CliProviderProfile) =>
    guard(async () => {
      const r = await cliProviderClient.activate(p.id);
      if (!r.ok) setMsg(r.error || t('启用失败'));
      else
        setMsg(
          r.usedRouting
            ? t('已启用（经本地路由）')
            : r.restartRequired
              ? t('已写入配置；Codex 可能需要重启会话')
              : t('已启用'),
        );
      refresh();
    });

  const deactivate = () =>
    guard(async () => {
      const r = await cliProviderClient.deactivate(kind);
      setMsg(r.ok ? t('已停用，{0} 回到自带登录/默认配置', NAME[kind]) : r.error || t('停用失败'));
      refresh();
    });

  const test = async (p: CliProviderProfile) => {
    setTests((c) => ({ ...c, [p.id]: 'pending' }));
    try {
      const r = await cliProviderClient.test(p.id);
      setTests((c) => ({ ...c, [p.id]: r }));
    } catch (e) {
      setTests((c) => ({
        ...c,
        [p.id]: { ok: false, latencyMs: 0, error: e instanceof Error ? e.message : String(e) },
      }));
    }
  };

  const edit = (p: CliProviderProfile) => {
    setEditingId(p.id);
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setApiKey('');
    setApiFormat(p.apiFormat);
  };

  const patchRoute = (patch: Partial<CliRouteSettings>) =>
    guard(async () => setRoute(await cliRouteClient.set(patch)));

  const where =
    kind === 'claude'
      ? t(
          '启用档案时只改写 {0} 的 env（ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL / ANTHROPIC_MODEL），hooks、权限等其它设置原样保留，改写前自动备份。',
          writes ?? '~/.claude/settings.json',
        )
      : kind === 'codex'
        ? t(
            '启用档案时只改写 {0}（model、model_provider 与 [model_providers.nomi]）和同目录 auth.json 的 OPENAI_API_KEY，其它内容原样保留，改写前自动备份。',
            writes ?? '~/.codex/config.toml',
          )
        : t(
            '启用档案时只写入 {0} 里带 Nomi 标记的区块；密钥不落盘，只在 Nomi 启动 dsh 时通过环境变量注入。',
            writes ?? '~/.dsh/cordis.patch.yml',
          );

  return (
    <div className={styles.section} data-testid={`providers-section-${kind}`}>
      <div className={styles.intro} data-testid="cli-ep-intro">
        <p>
          <strong>{t(NAME[kind])}</strong>
          {t(' 的供应商档案独立保存，与 Nomi、其它编程助手互不影响。')}
        </p>
        <p>{where}</p>
      </div>

      <section className={styles.card} data-testid="cli-ep-status">
        <h3 className={styles.cardTitle}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <EndpointIcon backend={kind} size={16} decorative />
            {t('当前使用')}
          </span>
        </h3>
        <dl className={styles.facts}>
          <dt>{t('供应商')}</dt>
          <dd data-testid="cli-ep-active">
            {active ? active.name : t('使用 CLI 自带登录/默认配置')}
          </dd>
          <dt>{t('来源')}</dt>
          <dd data-testid="cli-ep-source">
            {active ? t('Nomi 档案库（独立）') : t('CLI 自带登录 / 默认配置')}
          </dd>
          <dt>{t('上游格式')}</dt>
          <dd>{active ? formatLabel(kind, active.apiFormat) : '—'}</dd>
          <dt>{t('模型')}</dt>
          <dd>{active?.model || '—'}</dd>
          <dt>{t('本地路由')}</dt>
          <dd data-testid="cli-ep-routing" data-mode={rs.mode}>
            {rs.text}
          </dd>
        </dl>
        {active && (
          <div>
            <Button
              size="sm"
              disabled={busy}
              data-testid="cli-ep-use-default"
              onClick={() => void deactivate()}
            >
              {t('改用 CLI 自带登录/默认配置')}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.card} data-testid={`cli-provider-list-${kind}`}>
        <h3 className={styles.cardTitle}>{t('档案')}</h3>
        {profiles.length === 0 && <span className={styles.empty}>{t('暂无档案')}</span>}
        {profiles.map((p) => {
          const tr = tests[p.id];
          return (
            <div
              key={p.id}
              className={`${styles.row} ${p.active ? styles.rowActive : ''}`}
              data-testid={`cli-provider-row-${p.id}`}
            >
              <div className={styles.rowMain}>
                <span>
                  <strong>{p.name}</strong>{' '}
                  {p.active && (
                    <span className={styles.pill} data-testid="cli-provider-active">
                      {t('使用中')}
                    </span>
                  )}{' '}
                  {p.needsRouting && (
                    <span
                      className={`${styles.pill} ${styles.pillWarn}`}
                      data-testid="cli-provider-needs-routing"
                    >
                      {t('需路由')}
                    </span>
                  )}
                </span>
                <span className={styles.rowSub}>
                  {[formatLabel(kind, p.apiFormat), p.model, p.baseUrl].filter(Boolean).join(' · ')}
                </span>
                {tr && (
                  <span
                    className={`${styles.pill} ${
                      tr === 'pending' ? '' : tr.ok ? styles.pillOk : styles.pillBad
                    }`}
                    style={{ width: 'fit-content' }}
                    data-testid="cli-provider-test-result"
                    role="status"
                  >
                    {tr === 'pending'
                      ? t('测速中…')
                      : tr.ok
                        ? `${tr.latencyMs} ms${tr.note ? ` · ${tr.note}` : ''}`
                        : t('失败：{0}', tr.error ?? '')}
                  </span>
                )}
              </div>
              <div className={styles.rowActions}>
                <Button
                  size="sm"
                  disabled={busy || p.active}
                  data-testid="cli-provider-enable"
                  onClick={() => void activate(p)}
                >
                  {t('启用')}
                </Button>
                <Button
                  size="sm"
                  disabled={tr === 'pending'}
                  data-testid="cli-provider-test"
                  onClick={() => void test(p)}
                >
                  {t('测速')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => edit(p)}>
                  {t('编辑')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  data-testid="cli-provider-delete"
                  onClick={() =>
                    void guard(async () => (await cliProviderClient.remove(p.id), refresh()))
                  }
                >
                  {t('删除')}
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section className={styles.card} data-testid="cli-provider-form">
        <h3 className={styles.cardTitle}>{editingId ? t('编辑档案') : t('添加档案')}</h3>
        <div className={styles.form}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              {t('名称')}
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={styles.field}>
              {t('模型')}
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label className={styles.field}>
              {t('API 地址')}
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://…"
                data-testid="cli-provider-baseurl"
              />
            </label>
            <label className={styles.field}>
              {editingId ? t('API Key（留空保持不变）') : t('API Key')}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <div className={styles.field}>
            {t('上游格式')}
            <Select
              size="sm"
              data-testid="cli-provider-format"
              value={apiFormat}
              onChange={(e) => setApiFormat(e.target.value)}
              menuMinWidth={320}
              options={FORMATS[kind].map((f) => ({ value: f.value, label: t(f.label) }))}
            />
          </div>
          <div className={styles.rowActions}>
            <Button
              size="sm"
              disabled={busy || !baseUrl.trim()}
              onClick={() => void save()}
              data-testid="cli-provider-save"
            >
              {editingId ? t('保存修改') : t('添加档案')}
            </Button>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={resetForm}>
                {t('取消编辑')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <details className={styles.advanced} data-testid="cli-route-advanced">
        <summary>{t('高级')}</summary>
        <div className={styles.advBody}>
          {kind === 'dsh' ? (
            <p className={styles.sub}>
              {t(
                'dsh 原生支持 openai-completions / openai-responses / anthropic-messages，不需要本地路由。',
              )}
            </p>
          ) : (
            <>
              <p className={styles.sub}>
                {t('非原生上游格式时，CLI 仍发原生协议；由本机路由转换后再转发。')}
              </p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(route?.enabled)}
                  data-testid="cli-route-enabled"
                  onChange={(e) => void patchRoute({ enabled: e.target.checked })}
                />
                {t('开启本地路由')}
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={Boolean(route?.[kind])}
                  disabled={!route?.enabled}
                  data-testid={`cli-route-${kind}`}
                  onChange={(e) => void patchRoute({ [kind]: e.target.checked })}
                />
                {t('接管 {0}', NAME[kind])}
              </label>
              {route?.listenUrl && (
                <span className={styles.sub} data-testid="cli-route-url">
                  {t('监听')} {route.listenUrl}
                </span>
              )}
            </>
          )}
          <pre className={styles.paths} data-testid="cli-provider-paths">
            {[t('档案库：{0}', store ?? '-'), t('写入位置：{0}', writes ?? '-')].join('\n')}
          </pre>
        </div>
      </details>

      {msg && (
        <Notice tone="info" data-testid="cli-provider-msg">
          {msg}
        </Notice>
      )}
    </div>
  );
};
