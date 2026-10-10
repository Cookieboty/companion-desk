/**
 * ProviderPanel —— 多 provider 快速配置（参考 cc-switch）：
 *   预设选择 → 粘贴 key → 测试 → 保存 / 保存并设为当前；
 *   已保存 provider：启用开关、设为当前、Token 管理（掩码 / 添加 / 轮换 / 设为主 / 删除 / 测试）、用量；
 *   角色路由表（chat / agent-tools / summary → provider + 模型）。
 * key 只单向提交给主进程；提交后清空输入框，界面只显示掩码。
 */
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  Notice,
  Select,
  Switch,
  Textarea,
} from '@ig-live/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  LOCAL_ONLY_NOTICE,
  providerClient,
  selectableProviders,
  type ProviderInput,
  type ProviderPreset,
  type ProviderRole,
  type ProviderState,
  type ProviderView,
  type TestResult,
} from '../../services/providerClient';

import styles from './index.module.css';

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<ProviderRole, string> = {
  chat: '对话 chat',
  'agent-tools': '工具 agent-tools',
  summary: '摘要 summary',
};

const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function parseHeaders(text: string): Record<string, string> | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (t.startsWith('{')) return JSON.parse(t) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of t.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const TestBadge: React.FC<{ r?: TestResult | 'pending' }> = ({ r }) => {
  if (!r) return null;
  if (r === 'pending') return <Badge tone="neutral">测试中…</Badge>;
  return r.ok ? (
    <Badge tone="success" data-testid="test-ok">
      ✓ 连通 {r.latencyMs}ms
    </Badge>
  ) : (
    <Badge tone="danger" data-testid="test-fail" title={r.error}>
      ✗ {r.error?.slice(0, 80)}
    </Badge>
  );
};

const ProviderCard: React.FC<{
  p: ProviderView;
  effective: boolean;
  onError: (e: unknown) => void;
}> = ({ p, effective, onError }) => {
  const [newKey, setNewKey] = useState('');
  const [rotating, setRotating] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState('');
  const [tests, setTests] = useState<Record<string, TestResult | 'pending'>>({});
  const run = (fn: () => Promise<unknown>) => () => void fn().catch(onError);

  const test = (keyId?: string) =>
    run(async () => {
      const k = keyId ?? '_';
      setTests((t) => ({ ...t, [k]: 'pending' }));
      const r = await providerClient.test(p.id, keyId);
      setTests((t) => ({ ...t, [k]: r }));
    });

  return (
    <Card
      active={effective}
      className={styles.card}
      data-testid={`provider-card-${p.id}`}
      title={
        <>
          {p.name} {effective && <Badge>当前</Badge>}
        </>
      }
      subtitle={`${p.baseURL} · ${p.defaultModel}`}
      actions={
        <>
          <Switch
            checked={p.enabled}
            label="启用"
            title="启用"
            onChange={run(() => providerClient.upsert({ id: p.id, enabled: !p.enabled }))}
          />
          {!effective && (
            <Button
              size="sm"
              variant="primary"
              data-testid={`activate-${p.id}`}
              onClick={run(() => providerClient.setActive(p.id))}
            >
              设为当前
            </Button>
          )}
          <Button size="sm" onClick={test()}>
            测试
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={run(async () => {
              if (window.confirm(`删除 provider「${p.name}」及其所有 Token？`))
                await providerClient.remove(p.id);
            })}
          >
            删除
          </Button>
        </>
      }
    >
      <TestBadge r={tests._} />

      <div className={styles.keys}>
        {p.keys.length === 0 && <div className="cd-muted">未配置 Token</div>}
        {p.keys.map((k, i) => (
          <div key={k.id} className={styles.keyRow}>
            <code className="cd-code" data-testid="masked-key">
              {k.masked}
            </code>
            <Badge tone={i === 0 ? 'accent' : 'neutral'}>{i === 0 ? '主' : `备用 ${i}`}</Badge>
            {k.label && <span className="cd-muted">{k.label}</span>}
            {k.encryption === 'none' ? (
              <Badge tone="warning">⚠️ 未加密</Badge>
            ) : (
              <span className="cd-muted" title="safeStorage 加密">
                🔒
              </span>
            )}
            {k.lastError && (
              <Badge tone="danger" title={k.lastError}>
                上次失败
              </Badge>
            )}
            <span className="cd-spacer" />
            {i > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={run(() => providerClient.promoteKey(p.id, k.id))}
              >
                设为主
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRotating(rotating === k.id ? null : k.id)}
            >
              轮换
            </Button>
            <Button size="sm" variant="ghost" onClick={test(k.id)}>
              测试
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={run(() => providerClient.removeKey(p.id, k.id))}
            >
              删除
            </Button>
            <TestBadge r={tests[k.id]} />
            {rotating === k.id && (
              <div className={styles.inline}>
                <Input
                  size="sm"
                  type="password"
                  placeholder="新的 Token"
                  value={rotateValue}
                  autoComplete="off"
                  onChange={(e) => setRotateValue(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!rotateValue.trim()}
                  onClick={run(async () => {
                    await providerClient.rotateKey(p.id, k.id, rotateValue);
                    setRotateValue('');
                    setRotating(null);
                  })}
                >
                  保存
                </Button>
              </div>
            )}
          </div>
        ))}
        <div className={styles.inline}>
          <Input
            size="sm"
            type="password"
            placeholder="添加备用 Token（主 Token 失败时自动切换）"
            value={newKey}
            autoComplete="off"
            onChange={(e) => setNewKey(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!newKey.trim()}
            onClick={run(async () => {
              await providerClient.addKey(p.id, newKey);
              setNewKey('');
            })}
          >
            添加
          </Button>
        </div>
      </div>
      <div className="cd-muted" data-testid={`usage-${p.id}`}>
        用量（本地统计）：{p.usage.requests} 次请求 · 输入 {fmt(p.usage.inputTokens)} · 输出{' '}
        {fmt(p.usage.outputTokens)} tokens{p.usage.errors ? ` · ${p.usage.errors} 次失败` : ''}
      </div>
    </Card>
  );
};

export const ProviderPanel: React.FC<Props> = ({ isVisible, onClose }) => {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [state, setState] = useState<ProviderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState('deepseek');
  const [draft, setDraft] = useState<ProviderInput>({});
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [draftTest, setDraftTest] = useState<TestResult | 'pending'>();

  const onError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [ps, st] = await Promise.all([providerClient.presets(), providerClient.state()]);
      setPresets(ps);
      setState(st);
    } catch (e) {
      onError(e);
    }
  }, [onError]);

  useEffect(() => {
    if (!isVisible) return;
    void refresh();
    return providerClient.onChanged((s) => setState(s));
  }, [isVisible, refresh]);

  const preset = useMemo(() => presets.find((p) => p.id === presetId), [presets, presetId]);

  useEffect(() => {
    if (!preset) return;
    setDraft({
      presetId: preset.id,
      name: preset.name,
      baseURL: preset.baseURL,
      defaultModel: preset.defaultModel,
    });
    setDraftTest(undefined);
  }, [preset]);

  if (!isVisible) return null;

  const input = (): ProviderInput => ({
    ...draft,
    headers: parseHeaders(headersText),
    apiKey: apiKey.trim() || undefined,
  });

  const save = async (activate: boolean) => {
    try {
      setError(null);
      const view = await providerClient.upsert(input());
      if (activate) await providerClient.setActive(view.id);
      setApiKey('');
      setHeadersText('');
      setDraftTest(undefined);
    } catch (e) {
      onError(e);
    }
  };

  const options = state ? selectableProviders(state) : [];
  const total = (state?.providers.length ?? 0) + (state?.envProviders.length ?? 0);

  return (
    <Modal
      open
      onClose={onClose}
      title="AI Provider 与 Token"
      size="lg"
      data-testid="provider-panel"
    >
      <div className={styles.stack}>
        <Notice data-testid="local-only-notice">
          🔒 {LOCAL_ONLY_NOTICE}
          {state?.encryption === 'none' && (
            <div className={styles.warn} data-testid="encryption-warning">
              ⚠️ 当前系统不支持安全存储（safeStorage 不可用），Token 仅以编码形式保存在本机，
              未加密。请确保本机账户安全，或在支持系统钥匙串的环境中使用。
            </div>
          )}
          {state?.overrideId && (
            <div className={styles.warn}>
              环境变量 COMPANION_PROVIDER={state.overrideId} 已锁定默认 provider，此处切换不会生效。
            </div>
          )}
        </Notice>

        {error && (
          <Notice tone="danger" onClick={() => setError(null)} title="点击关闭">
            {error}
          </Notice>
        )}

        <section>
          <h3 className="cd-section-title">快速切换</h3>
          <Select
            data-testid="active-select"
            value={state?.effectiveProviderId ?? ''}
            onChange={(e) => void providerClient.setActive(e.target.value || null).catch(onError)}
            options={options.map((o) => ({ value: o.id, label: o.label, disabled: o.disabled }))}
          />
        </section>

        <section>
          <h3 className="cd-section-title">添加 Provider</h3>
          <Card flat>
            <div className={styles.form}>
              <FormField label="预设">
                <Select
                  data-testid="preset-select"
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                  options={presets.map((p) => ({ value: p.id, label: p.name }))}
                />
              </FormField>
              <FormField label="名称">
                <Input
                  data-testid="draft-name"
                  value={draft.name ?? ''}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </FormField>
              <FormField label="Base URL">
                <Input
                  data-testid="draft-baseurl"
                  value={draft.baseURL ?? ''}
                  onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
                />
              </FormField>
              <FormField label="默认模型">
                <Input
                  data-testid="draft-model"
                  list="preset-models"
                  value={draft.defaultModel ?? ''}
                  onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
                />
              </FormField>
              <datalist id="preset-models">
                {preset?.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <FormField
                label="API Key"
                hint={preset?.apiKeyUrl ? `获取：${preset.apiKeyUrl}` : undefined}
              >
                <Input
                  data-testid="draft-key"
                  type="password"
                  autoComplete="off"
                  placeholder={preset?.requiresApiKey ? '粘贴 Token' : '可留空（本地服务）'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </FormField>
              <FormField
                label="额外 Headers（可选，每行 Name: value 或 JSON）"
                className={styles.full}
              >
                <Textarea
                  data-testid="draft-headers"
                  rows={2}
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                />
              </FormField>
              <div className={`cd-row ${styles.full}`}>
                <Button
                  data-testid="draft-test"
                  onClick={() => {
                    setDraftTest('pending');
                    providerClient
                      .testDraft(input())
                      .then(setDraftTest)
                      .catch((e) => {
                        setDraftTest(undefined);
                        onError(e);
                      });
                  }}
                >
                  测试连接
                </Button>
                <Button data-testid="draft-save" onClick={() => void save(false)}>
                  保存
                </Button>
                <Button
                  variant="primary"
                  data-testid="draft-save-activate"
                  onClick={() => void save(true)}
                >
                  保存并设为当前
                </Button>
                <TestBadge r={draftTest} />
              </div>
            </div>
          </Card>
        </section>

        <section className={styles.stack}>
          <h3 className="cd-section-title">已配置（{state?.providers.length ?? 0}）</h3>
          {state && total === 0 && (
            <EmptyState
              icon="🔌"
              title="还没有 provider"
              description="从上方选择预设，粘贴 Token 即可开始"
            />
          )}
          {state?.providers.map((p) => (
            <ProviderCard
              key={p.id}
              p={p}
              effective={state.effectiveProviderId === p.id}
              onError={onError}
            />
          ))}
          {state?.envProviders.map((e) => (
            <Card
              key={e.id}
              flat
              active={state.effectiveProviderId === e.id}
              title={
                <>
                  {e.name} <Badge tone="neutral">环境变量</Badge>
                  {state.effectiveProviderId === e.id && <Badge>当前</Badge>}
                </>
              }
              subtitle={`${e.baseURL} · ${e.defaultModel} · ${
                e.keyless ? '本地服务，无需 key' : e.hasKey ? 'key 已由环境变量提供' : '未设置 key'
              }`}
              actions={
                state.effectiveProviderId !== e.id && e.hasKey ? (
                  <Button
                    size="sm"
                    onClick={() => void providerClient.setActive(e.id).catch(onError)}
                  >
                    设为当前
                  </Button>
                ) : undefined
              }
            >
              <div className="cd-muted">
                用量：{e.usage.requests} 次 · 输入 {fmt(e.usage.inputTokens)} · 输出{' '}
                {fmt(e.usage.outputTokens)} tokens
              </div>
            </Card>
          ))}
        </section>

        <section>
          <h3 className="cd-section-title">模型路由（按任务绑定 provider）</h3>
          <table className="cd-table" data-testid="routes-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>Provider</th>
                <th>模型（留空用默认）</th>
              </tr>
            </thead>
            <tbody>
              {(state?.roles ?? []).map((role) => {
                const r = state?.routes[role];
                return (
                  <tr key={role}>
                    <td>{ROLE_LABELS[role]}</td>
                    <td>
                      <Select
                        size="sm"
                        data-testid={`route-${role}`}
                        value={r?.providerId ?? ''}
                        onChange={(e) =>
                          void providerClient
                            .setRoute(
                              role,
                              e.target.value
                                ? { providerId: e.target.value, model: r?.model }
                                : null,
                            )
                            .catch(onError)
                        }
                      >
                        <option value="">跟随当前</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id} disabled={o.disabled}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Input
                        size="sm"
                        defaultValue={r?.model ?? ''}
                        disabled={!r}
                        placeholder="default"
                        onBlur={(e) =>
                          r &&
                          void providerClient
                            .setRoute(role, { providerId: r.providerId, model: e.target.value })
                            .catch(onError)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="cd-muted">
            优先级：COMPANION_PROVIDER 环境变量 &gt; 任务路由 &gt; 当前 provider &gt; 环境变量
            provider。
          </p>
        </section>
      </div>
    </Modal>
  );
};
