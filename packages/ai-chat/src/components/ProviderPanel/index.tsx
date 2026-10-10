/**
 * ProviderPanel —— 供应商管理（cc-switch 语义）：
 *   列表（当前徽标 / 一键切换 / 编辑 / 测速 / 删除）→ 添加（搜索 + 分类预设）→ 编辑（通用三协议表单）；
 *   任务路由：chat / agent-tools / summary 从各供应商已启用（或已获取）的模型里选。
 * 明文 key 只单向提交给主进程；界面只显示掩码。
 */
import { Badge, Button, Card, EmptyState, Modal, Notice, Select } from '@ig-live/ui';
import React, { useCallback, useEffect, useState } from 'react';

import {
  PROTOCOL_LABELS,
  endpointPreview,
  providerClient,
  selectableModels,
  selectableProviders,
  type ProviderPreset,
  type ProviderRole,
  type ProviderState,
  type ProviderView,
  type TestResult,
} from '../../services/providerClient';

import { AddProvider } from './AddProvider';
import styles from './index.module.css';
import { ProviderEditor, type EditorTarget } from './ProviderEditor';
import { Monogram, TestBadge, fmt } from './shared';

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<ProviderRole, string> = {
  chat: '对话 chat',
  'agent-tools': '工具 agent-tools',
  summary: '摘要 summary',
};

type View = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; target: EditorTarget };

const ProviderRow: React.FC<{
  p: ProviderView;
  current: boolean;
  locked: boolean;
  onEdit: () => void;
  onError: (e: unknown) => void;
}> = ({ p, current, locked, onEdit, onError }) => {
  const [test, setTest] = useState<TestResult | 'pending'>();
  const run = (fn: () => Promise<unknown>) => () => void fn().catch(onError);
  return (
    <Card
      active={current}
      className={styles.card}
      data-testid={`provider-card-${p.id}`}
      title={
        <span className={styles.inline}>
          <Monogram name={p.name} size={28} />
          <span>{p.name}</span>
          {current && <Badge data-testid="current-badge">当前</Badge>}
          {!p.enabled && <Badge tone="neutral">已停用</Badge>}
          {p.note && <span className="cd-muted">{p.note}</span>}
        </span>
      }
      subtitle={
        <span>
          {PROTOCOL_LABELS[p.protocol]} ·{' '}
          <code className="cd-code">{endpointPreview(p.protocol, p.baseURL, p.fullUrl)}</code> ·{' '}
          {p.defaultModel}
          {p.models.length > 1 && ` 等 ${p.models.length} 个模型`}
        </span>
      }
      actions={
        <>
          <TestBadge r={test} />
          {!current && (
            <Button
              size="sm"
              variant="primary"
              disabled={locked}
              data-testid={`activate-${p.id}`}
              onClick={run(() => providerClient.setActive(p.id))}
            >
              启用
            </Button>
          )}
          <Button
            size="sm"
            data-testid={`speed-${p.id}`}
            onClick={run(async () => {
              setTest('pending');
              setTest(await providerClient.test(p.id));
            })}
          >
            ⚡ 测速
          </Button>
          <Button size="sm" data-testid={`edit-${p.id}`} onClick={onEdit}>
            编辑
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={run(async () => {
              if (window.confirm(`删除供应商「${p.name}」及其所有 Token？`))
                await providerClient.remove(p.id);
            })}
          >
            删除
          </Button>
        </>
      }
    >
      <div className="cd-muted" data-testid={`usage-${p.id}`}>
        {p.keys.length > 0
          ? `Token ${p.keys[0]!.masked}${p.keys.length > 1 ? ` +${p.keys.length - 1}` : ''}`
          : '无 Token'}{' '}
        · 用量（本地统计）：
        {p.usage.requests} 次请求 · 输入 {fmt(p.usage.inputTokens)} · 输出{' '}
        {fmt(p.usage.outputTokens)} tokens
        {p.usage.errors ? ` · ${p.usage.errors} 次失败` : ''}
      </div>
    </Card>
  );
};

const RoutesTable: React.FC<{ state: ProviderState; onError: (e: unknown) => void }> = ({
  state,
  onError,
}) => {
  const options = selectableProviders(state);
  return (
    <table className="cd-table" data-testid="routes-table">
      <thead>
        <tr>
          <th>任务</th>
          <th>供应商</th>
          <th>模型</th>
        </tr>
      </thead>
      <tbody>
        {state.roles.map((role) => {
          const r = state.routes[role];
          const models = selectableModels(state, r?.providerId);
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
                      .setRoute(role, e.target.value ? { providerId: e.target.value } : null)
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
                <Select
                  size="sm"
                  data-testid={`route-model-${role}`}
                  disabled={!r}
                  value={r?.model ?? ''}
                  onChange={(e) =>
                    r &&
                    void providerClient
                      .setRoute(role, {
                        providerId: r.providerId,
                        model: e.target.value || undefined,
                      })
                      .catch(onError)
                  }
                >
                  <option value="">默认模型</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export const ProviderPanel: React.FC<Props> = ({ isVisible, onClose }) => {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [state, setState] = useState<ProviderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'list' });

  const onError = useCallback(
    (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    [],
  );

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
    setView({ kind: 'list' });
    void refresh();
    return providerClient.onChanged((s) => setState(s));
  }, [isVisible, refresh]);

  if (!isVisible) return null;
  const locked = Boolean(state?.overrideId);
  const current = state?.effectiveProviderId;
  const title =
    view.kind === 'add' ? '添加供应商' : view.kind === 'edit' ? '供应商设置' : 'AI 供应商';

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      data-testid="provider-panel"
      bodyClassName={styles.modalBody}
    >
      <div className={styles.stack}>
        {error && (
          <Notice
            tone="danger"
            onClick={() => setError(null)}
            title="点击关闭"
            data-testid="provider-error"
          >
            {error}
          </Notice>
        )}
        {state?.encryption === 'none' && (
          <Notice tone="warning" data-testid="encryption-warning">
            ⚠️ 当前系统不支持安全存储（safeStorage 不可用），Token 仅以编码形式保存在本机，未加密。
          </Notice>
        )}
        {locked && view.kind === 'list' && (
          <Notice tone="warning">
            环境变量 COMPANION_PROVIDER={state!.overrideId} 已锁定对话供应商，此处切换不会生效。
          </Notice>
        )}

        {view.kind === 'add' && (
          <>
            <div className={styles.inline}>
              <Button
                size="sm"
                variant="ghost"
                data-testid="add-back"
                onClick={() => setView({ kind: 'list' })}
              >
                ‹ 返回
              </Button>
            </div>
            <AddProvider
              presets={presets}
              onPick={(p) => setView({ kind: 'edit', target: { kind: 'new', preset: p } })}
            />
          </>
        )}

        {view.kind === 'edit' && (
          <ProviderEditor
            key={
              view.target.kind === 'edit' ? view.target.provider.id : `new-${view.target.preset.id}`
            }
            target={view.target}
            isActive={view.target.kind === 'edit' && view.target.provider.id === current}
            onBack={() => setView(view.target.kind === 'new' ? { kind: 'add' } : { kind: 'list' })}
            onSaved={() => {
              setError(null);
              setView({ kind: 'list' });
            }}
            onError={onError}
          />
        )}

        {view.kind === 'list' && state && (
          <>
            <div className={styles.inline}>
              <span className="cd-muted">
                当前：
                <b data-testid="current-provider">
                  {selectableProviders(state).find((o) => o.id === current)?.label ?? '未选择'}
                </b>
                {state.effectiveModel && (
                  <>
                    {' '}
                    · <span data-testid="current-model">{state.effectiveModel}</span>
                  </>
                )}
              </span>
              <span className="cd-spacer" />
              <Button
                variant="primary"
                data-testid="add-provider-btn"
                onClick={() => setView({ kind: 'add' })}
              >
                ＋ 添加供应商
              </Button>
            </div>
            {state.providers.length + state.envProviders.length === 0 && (
              <EmptyState
                icon="🔌"
                title="还没有供应商"
                description="点「添加供应商」，选择预设或自定义配置"
              />
            )}
            {state.providers.map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                current={current === p.id}
                locked={locked}
                onEdit={() => setView({ kind: 'edit', target: { kind: 'edit', provider: p } })}
                onError={onError}
              />
            ))}
            {state.envProviders
              .filter((e) => e.hasKey)
              .map((e) => (
                <Card
                  key={e.id}
                  flat
                  active={current === e.id}
                  title={
                    <span className={styles.inline}>
                      <Monogram name={e.name} size={28} />
                      {e.name}
                      {current === e.id && <Badge>当前</Badge>}
                    </span>
                  }
                  subtitle={`${PROTOCOL_LABELS[e.protocol]} · ${e.baseURL ?? ''} · ${e.defaultModel ?? ''} · ${
                    e.keyless
                      ? '本地服务，无需 key'
                      : e.hasKey
                        ? 'key 由环境变量提供'
                        : '未设置 key'
                  }`}
                  actions={
                    current !== e.id && e.hasKey ? (
                      <Button
                        size="sm"
                        disabled={locked}
                        onClick={() => void providerClient.setActive(e.id).catch(onError)}
                      >
                        启用
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            <section>
              <h3 className="cd-section-title">任务路由（可选，默认都跟随当前供应商）</h3>
              <RoutesTable state={state} onError={onError} />
              <p className="cd-muted">
                优先级：COMPANION_PROVIDER 环境变量 &gt; 任务路由 &gt; 当前供应商。工具栏 /
                托盘一键切换会让「对话」立即改用所选供应商。
              </p>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
};
