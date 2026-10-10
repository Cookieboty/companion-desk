/**
 * DesktopPanel —— 桌面能力设置：授权文件夹（系统选择框）、工具权限、隐私（仅本地模型 / 云端提示）、
 * 操作记录（审计日志）与撤销。全部数据只保存在本机 userData。
 */
import { Badge, Button, Card, EmptyState, Modal, Notice, Select, Switch, Tabs } from '@ig-live/ui';
import React, { useCallback, useEffect, useState } from 'react';

import {
  DANGER_LABELS,
  POLICY_LABELS,
  TOOL_LABELS,
  desktopClient,
  type AuditEntryView,
  type DesktopState,
  type JournalView,
  type Policy,
} from '../../services/desktopClient';

import styles from './index.module.css';

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

type Tab = 'folders' | 'tools' | 'privacy' | 'log';

const DECISION_LABEL: Record<string, string> = {
  auto: '自动',
  allowed: '已允许',
  denied: '已拒绝',
  timeout: '超时拒绝',
  user: '用户操作',
  error: '失败',
};

const fmt = (ts: number) => new Date(ts).toLocaleString();

export const DesktopPanel: React.FC<Props> = ({ isVisible, onClose }) => {
  const [tab, setTab] = useState<Tab>('folders');
  const [state, setState] = useState<DesktopState | null>(null);
  const [audit, setAudit] = useState<AuditEntryView[]>([]);
  const [journal, setJournal] = useState<JournalView[]>([]);
  const [msg, setMsg] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!desktopClient.available()) return;
    const [s, a, j] = await Promise.all([
      desktopClient.state(),
      desktopClient.audit(200),
      desktopClient.journal(),
    ]);
    setState(s);
    setAudit(a);
    setJournal(j);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    void refresh();
    return desktopClient.onChanged(() => void refresh());
  }, [isVisible, refresh]);

  if (!isVisible) return null;

  const grant = async (mode: 'read' | 'read-write') => {
    const s = await desktopClient.grant(mode);
    setMsg(s ? `已授权：${s.path}` : '已取消');
    void refresh();
  };

  const undo = async () => {
    const r = await desktopClient.undoLast();
    setMsg(r.ok ? `已撤销：${r.undone}` : `无法撤销：${r.error}`);
    void refresh();
  };

  return (
    <Modal open onClose={onClose} title="桌面能力" size="lg" data-testid="desktop-panel">
      <div className={styles.stack}>
        <Notice>
          🔒
          授权、权限、操作记录都只保存在本机。看板娘只能访问你在这里授权的文件夹；删除一律进回收站，可撤销。
        </Notice>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          items={[
            { value: 'folders', label: '授权文件夹' },
            { value: 'tools', label: '工具权限' },
            { value: 'privacy', label: '隐私' },
            { value: 'log', label: '操作记录' },
          ]}
        />
        {msg && (
          <div className={styles.msg} data-testid="desktop-msg">
            {msg}
          </div>
        )}

        {tab === 'folders' && (
          <div className={styles.stack} data-testid="desktop-folders">
            <div className={styles.row}>
              <Button
                variant="primary"
                onClick={() => void grant('read')}
                data-testid="desktop-grant-read"
              >
                ＋ 授权文件夹（只读）
              </Button>
              <Button
                variant="secondary"
                onClick={() => void grant('read-write')}
                data-testid="desktop-grant-rw"
              >
                ＋ 授权文件夹（读写）
              </Button>
            </div>
            {state && state.scopes.length === 0 ? (
              <EmptyState
                title="还没有授权任何文件夹"
                description="默认看板娘看不到你的任何文件。"
              />
            ) : (
              state?.scopes.map((s) => (
                <Card
                  key={s.id}
                  data-testid="desktop-scope"
                  title={s.path}
                  subtitle={`${s.kind === 'file' ? '单个文件' : '文件夹'} · ${fmt(s.grantedAt)}`}
                  actions={
                    <>
                      <Badge tone={s.mode === 'read-write' ? 'warning' : 'neutral'}>
                        {s.mode === 'read-write' ? '读写' : '只读'}
                      </Badge>
                      {s.session && <Badge>仅本次运行</Badge>}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void desktopClient.revoke(s.id)}
                        data-testid="desktop-revoke"
                      >
                        撤销授权
                      </Button>
                    </>
                  }
                />
              ))
            )}
            <p className={styles.hint}>
              始终拒绝：.ssh / .gnupg / 云凭据 / 浏览器配置 / 钥匙串 / *.kdbx / id_rsa / .env
              等，以及应用自己的数据目录。
            </p>
          </div>
        )}

        {tab === 'tools' && state && (
          <table className={styles.table} data-testid="desktop-tools">
            <thead>
              <tr>
                <th>工具</th>
                <th>级别</th>
                <th>确认方式</th>
              </tr>
            </thead>
            <tbody>
              {state.tools.map((t) => (
                <tr key={t.name}>
                  <td>
                    {TOOL_LABELS[t.name] ?? t.name}
                    <div className={styles.code}>{t.name}</div>
                  </td>
                  <td>
                    <Badge
                      tone={
                        t.danger === 'destructive'
                          ? 'danger'
                          : t.danger === 'write'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {DANGER_LABELS[t.danger]}
                    </Badge>
                  </td>
                  <td>
                    {t.danger === 'destructive' ? (
                      <span className={styles.hint}>每次都需在对话框中确认（不可更改）</span>
                    ) : t.name === 'desktop_request_scope' ? (
                      <span className={styles.hint}>由你在系统文件夹选择框中决定</span>
                    ) : t.locked ? (
                      <span className={styles.hint}>每次都询问（不可更改）</span>
                    ) : (
                      <Select
                        value={t.policy}
                        onChange={(e) =>
                          void desktopClient.setPolicy(t.name, e.target.value as Policy)
                        }
                        options={(['always', 'session', 'ask'] as Policy[]).map((p) => ({
                          value: p,
                          label: POLICY_LABELS[p],
                        }))}
                        data-testid={`desktop-policy-${t.name}`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'privacy' && state && (
          <div className={styles.stack} data-testid="desktop-privacy">
            <Switch
              checked={state.localOnly}
              onChange={(v) => void desktopClient.setLocalOnly(v)}
              label="仅本地模型可读文件"
              data-testid="desktop-local-only"
            />
            <p className={styles.hint}>
              开启后，只有本机模型（如 Ollama，地址为 localhost）才能读取 /
              总结文件内容；云端模型调用文件工具会被拒绝。
            </p>
            <div>
              第一次把文件内容发给某个云端模型时会弹出提示。已确认过的：
              {state.cloudAcked.length
                ? state.cloudAcked.map((p) => <Badge key={p}>{p}</Badge>)
                : ' 无'}
            </div>
            <div className={styles.row}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void desktopClient.resetCloudAcks()}
              >
                重新提示
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  void desktopClient.resetAll().then(() => setMsg('已清除全部桌面能力数据'))
                }
              >
                清除全部（授权 / 权限 / 记录）
              </Button>
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div className={styles.stack} data-testid="desktop-log">
            <div className={styles.row}>
              <Button
                onClick={() => void undo()}
                disabled={!journal.some((j) => !j.undone)}
                data-testid="desktop-undo"
              >
                ↶ 撤销上一步
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void desktopClient.clearAudit().then(refresh)}
              >
                清空记录
              </Button>
            </div>
            {journal.length > 0 && (
              <div>
                <h4 className={styles.h4}>可撤销的操作</h4>
                <ul className={styles.list}>
                  {journal.map((j) => (
                    <li key={j.id} data-testid="desktop-journal-item">
                      {fmt(j.ts)} · {j.summary} {j.undone && <Badge>已撤销</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <h4 className={styles.h4}>审计日志</h4>
            {audit.length === 0 ? (
              <EmptyState title="还没有记录" />
            ) : (
              <table className={styles.table} data-testid="desktop-audit">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作</th>
                    <th>结果</th>
                    <th>参数</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={`${a.ts}-${i}`} data-testid="desktop-audit-row">
                      <td>{fmt(a.ts)}</td>
                      <td>
                        {TOOL_LABELS[a.tool] ?? a.tool}
                        <div className={styles.code}>{a.source ?? ''}</div>
                      </td>
                      <td>
                        <Badge tone={a.result === 'ok' ? 'success' : 'danger'}>
                          {DECISION_LABEL[a.decision] ?? a.decision} · {a.result}
                        </Badge>
                      </td>
                      <td className={styles.code}>{JSON.stringify(a.args)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default DesktopPanel;
