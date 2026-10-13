/**
 * LocalPanel —— 本地中心：本机模型（llama.cpp 按需下载 / 启停 / 删除 / 设为聊天模型、Ollama）、
 * 本地日历（.ics / 订阅 / CalDAV）、剪贴板历史、全部数据导出。
 */
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Notice,
  Select,
  SkeletonList,
  Switch,
  Tabs,
} from '@ig-live/ui';
import React, { useCallback, useEffect, useState } from 'react';

import {
  FIT_LABEL,
  STATUS_LABEL,
  collectConversations,
  fmtBytes,
  fmtWhen,
  hubClient,
  localClient,
  pct,
  type CalSource,
  type ClipState,
  type LocalModel,
  type LocalState,
  type OllamaModel,
  type Occurrence,
  type Progress,
} from '../../services/localClient';

import styles from './index.module.css';

type Tab = 'models' | 'ollama' | 'calendar' | 'clipboard' | 'export';
const TABS: Tab[] = ['calendar', 'clipboard', 'export', 'models', 'ollama'];
const EXPORT_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'conversations', label: '聊天记录' },
  { key: 'memory', label: '记忆' },
  { key: 'schedule', label: '提醒与日程任务' },
  { key: 'calendar', label: '日历' },
  { key: 'clipboard', label: '剪贴板历史' },
  { key: 'skills', label: '技能包' },
  { key: 'screen', label: '屏幕记忆（文字索引）' },
  { key: 'settings', label: '设置与笔记（不含密钥）' },
];

const Bar: React.FC<{ p?: Progress; label?: string }> = ({ p, label }) => (
  <div className={styles.stack} data-testid="local-progress">
    <div className={styles.bar}>
      <i style={{ width: `${pct(p)}%` }} />
    </div>
    <span className={styles.hint}>
      {label ?? '下载中'}{' '}
      {p?.total
        ? `${fmtBytes(p.received)} / ${fmtBytes(p.total)} · ${pct(p)}%`
        : (p?.status ?? '…')}
    </span>
  </div>
);

interface Confirm {
  id: string;
  title: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  bytes: number;
  extra?: string;
}

export const LocalPanel: React.FC<{
  isVisible: boolean;
  onClose: () => void;
  initialTab?: Tab;
}> = ({ isVisible, onClose, initialTab }) => {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'calendar');
  const [st, setSt] = useState<LocalState | null>(null);
  const [prog, setProg] = useState<Record<string, Progress>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [ollama, setOllama] = useState<OllamaModel[] | null>(null);
  const [ollamaErr, setOllamaErr] = useState('');
  const [pullName, setPullName] = useState('');
  const [sources, setSources] = useState<CalSource[] | null>(null);
  const [events, setEvents] = useState<Occurrence[]>([]);
  const [newEv, setNewEv] = useState<{
    summary: string;
    date: string;
    time: string;
    mins: string;
    rrule: string;
  } | null>(null);
  const [newSrc, setNewSrc] = useState<{
    kind: 'ics-url' | 'caldav';
    name: string;
    url: string;
    username: string;
    password: string;
  } | null>(null);
  const [clips, setClips] = useState<ClipState | null>(null);
  const [exp, setExp] = useState<Set<string>>(new Set(EXPORT_ITEMS.map((x) => x.key)));
  const [expDone, setExpDone] = useState('');

  const load = useCallback(async () => {
    try {
      setSt(await localClient.state());
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  const loadOllama = useCallback(async () => {
    try {
      setOllama(await localClient.ollamaList());
      setOllamaErr('');
    } catch (e) {
      setOllama([]);
      setOllamaErr((e as Error).message);
    }
  }, []);
  const loadCal = useCallback(async () => {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const [s, ev] = await Promise.all([
        hubClient.calState(),
        hubClient.calRange(now.getTime(), now.getTime() + 14 * 86_400_000),
      ]);
      setSources(s.sources);
      setEvents(ev);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  const loadClips = useCallback(async () => {
    try {
      setClips(await hubClient.clipState());
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const offs = [
      localClient.onChanged(() => void load()),
      localClient.onProgress((p) => setProg((cur) => ({ ...cur, [p.id]: p }))),
      hubClient.onChanged(() => void loadCal()),
      hubClient.onClips(() => void loadClips()),
    ];
    return () => offs.forEach((f) => f());
  }, [isVisible, load, loadCal, loadClips]);
  useEffect(() => {
    if (!isVisible) return;
    if (tab === 'ollama' && ollama === null) void loadOllama();
    if (tab === 'calendar') void loadCal();
    if (tab === 'clipboard') void loadClips();
  }, [isVisible, tab, ollama, loadOllama, loadCal, loadClips]);
  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (e.altKey && n >= 1 && n <= TABS.length) {
        e.preventDefault();
        setTab(TABS[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isVisible]);

  const run = async (key: string, fn: () => Promise<unknown>, after?: () => unknown) => {
    setBusy(key);
    setErr('');
    try {
      const r = (await fn()) as { ok?: boolean; error?: string } | undefined;
      if (r && typeof r === 'object' && r.ok === false && r.error) setErr(r.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      setProg({});
      void load();
      if (after) void after();
    }
  };

  const askDownload = (m: LocalModel) =>
    setConfirm({
      id: m.id,
      title: `下载「${m.name}」`,
      license: m.license,
      licenseUrl: m.licenseUrl,
      sourceUrl: m.sourceUrl,
      bytes: m.bytes,
      extra:
        st && !st.runtime.installed && st.runtime.supported
          ? `还会一并下载 llama.cpp 运行时 ${st.runtime.tag}（${st.runtime.license}，约 ${fmtBytes(st.runtime.bytes)}）。`
          : undefined,
    });
  const doDownload = async (c: Confirm) => {
    setConfirm(null);
    await run(`d:${c.id}`, async () => {
      if (st && !st.runtime.installed) {
        const r = await localClient.downloadRuntime();
        if (!r.ok) return r;
      }
      return localClient.download(c.id);
    });
  };

  const srv = st?.server;
  const running = srv?.status === 'running';
  const rec = st?.models.find((m) => m.id === st.recommended);

  const models = st && (
    <div className={styles.stack}>
      <Notice tone="info" data-testid="local-ram">
        这台电脑约有 {st.ramGb} GB 内存，推荐 <b>{rec?.name}</b>
        。模型完全在本机运行，聊天内容不出电脑。
      </Notice>
      {!st.runtime.supported && (
        <Notice tone="warning">
          当前系统暂不支持内置的 llama.cpp 运行时，可以改用 Ollama 标签页。
        </Notice>
      )}
      <div className={styles.card} data-testid="local-server">
        <div className={styles.cardHead}>
          <b className={styles.grow}>本机推理服务（llama.cpp {st.runtime.tag}）</b>
          <Badge
            tone={
              running
                ? 'success'
                : srv?.status === 'error'
                  ? 'danger'
                  : srv?.status === 'starting'
                    ? 'accent'
                    : 'neutral'
            }
            data-testid="local-server-status"
          >
            {STATUS_LABEL[srv!.status]}
          </Badge>
        </div>
        <div className={styles.meta}>
          {running
            ? `${st.models.find((m) => m.id === srv!.model)?.name ?? srv!.model} · ${srv!.baseURL} · 已注册为「llama.cpp（本机）」`
            : st.runtime.installed
              ? '运行时已就绪，选一个已下载的模型点「启动」。'
              : `运行时会在第一次下载模型时按需获取（${st.runtime.license}）。`}
        </div>
        {srv?.error && <div className={styles.err}>{srv.error}</div>}
        {prog['llama-runtime'] && !st.runtime.installed && (
          <Bar p={prog['llama-runtime']} label="下载运行时" />
        )}
        <div className={styles.row}>
          {running && (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void run('use', () => localClient.use())}
                data-testid="local-use"
              >
                设为聊天模型
              </Button>
              <Button
                size="sm"
                onClick={() => void run('stop', () => localClient.stop())}
                data-testid="local-stop"
              >
                停止
              </Button>
            </>
          )}
          <span className={styles.grow} />
          <label className={styles.check}>
            <Switch
              checked={st.settings.autoStart}
              onChange={(v) => void run('as', () => localClient.setSettings({ autoStart: v }))}
              aria-label="开机自动启动本地模型"
            />
            启动应用时自动运行
          </label>
          <label className={styles.check}>
            <Switch
              checked={st.offline}
              onChange={(v) => void run('off', () => localClient.offline(v))}
              aria-label="离线模式"
              data-testid="local-offline"
            />
            离线模式（仅本地模型）
          </label>
        </div>
      </div>
      <div className={styles.list} data-testid="local-models">
        {st.models.map((m) => {
          const p = prog[m.id] ?? m.downloading;
          const isRun = running && srv?.model === m.id;
          return (
            <div key={m.id} className={styles.card} data-testid={`local-model-${m.id}`}>
              <div className={styles.cardHead}>
                <b className={styles.grow}>{m.name}</b>
                {m.id === st.recommended && <Badge tone="accent">推荐</Badge>}
                <Badge tone={m.fit === 'ok' ? 'success' : m.fit === 'tight' ? 'warning' : 'danger'}>
                  {FIT_LABEL[m.fit]}
                </Badge>
                <Badge tone="neutral">{m.license}</Badge>
                {m.installed && <Badge tone="success">已下载</Badge>}
                {isRun && <Badge tone="success">运行中</Badge>}
              </div>
              <div className={styles.meta}>
                {m.params} · {m.quant} · {fmtBytes(m.bytes)} · 建议 ≥ {m.minRamGb} GB 内存 ·{' '}
                {m.description}
              </div>
              {p && busy === `d:${m.id}` && <Bar p={p} />}
              <div className={styles.row}>
                {!m.installed ? (
                  busy === `d:${m.id}` ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        void localClient.cancel(st.runtime.installed ? m.id : 'llama-runtime')
                      }
                      data-testid="local-cancel"
                    >
                      取消
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={m.id === st.recommended ? 'primary' : 'secondary'}
                      disabled={!!busy || !st.runtime.supported}
                      onClick={() => askDownload(m)}
                      data-testid="local-download"
                    >
                      下载
                    </Button>
                  )
                ) : (
                  <>
                    {!isRun && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!!busy || srv?.status === 'starting'}
                        onClick={() => void run(`s:${m.id}`, () => localClient.start(m.id))}
                        data-testid="local-start"
                      >
                        {busy === `s:${m.id}` ? '启动中…' : running ? '切换到它' : '启动'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!!busy}
                      onClick={() => {
                        if (window.confirm(`删除「${m.name}」的模型文件（${fmtBytes(m.bytes)}）？`))
                          void run(`r:${m.id}`, () => localClient.remove(m.id));
                      }}
                      data-testid="local-remove"
                    >
                      删除
                    </Button>
                  </>
                )}
                <span className={styles.grow} />
                <a className={styles.hint} href={m.licenseUrl} target="_blank" rel="noreferrer">
                  许可证
                </a>
                <a className={styles.hint} href={m.sourceUrl} target="_blank" rel="noreferrer">
                  模型卡
                </a>
              </div>
            </div>
          );
        })}
      </div>
      {st.runtime.installed && !running && (
        <div className={styles.row}>
          <span className={styles.hint}>运行时占用约 {fmtBytes(st.runtime.bytes)}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void run('rr', () => localClient.removeRuntime())}
          >
            删除运行时
          </Button>
        </div>
      )}
    </div>
  );

  const ollamaTab = (
    <div className={styles.stack}>
      <p className={styles.hint}>
        已安装 Ollama 的话，可以在这里管理它的模型（地址：{st?.settings.ollamaUrl}
        ）。请只拉取许可证允许你使用的模型。
      </p>
      <div className={styles.row}>
        <Input
          className={styles.grow}
          size="sm"
          value={pullName}
          placeholder="模型名，例如 qwen3:0.6b"
          onChange={(e) => setPullName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pullName.trim())
              void run('pull', () => localClient.ollamaPull(pullName.trim()), loadOllama);
          }}
          data-testid="ollama-name"
        />
        <Button
          size="sm"
          variant="primary"
          disabled={!pullName.trim() || !!busy}
          onClick={() =>
            void run('pull', () => localClient.ollamaPull(pullName.trim()), loadOllama)
          }
          data-testid="ollama-pull"
        >
          拉取
        </Button>
        <Button size="sm" onClick={() => void loadOllama()}>
          刷新
        </Button>
      </div>
      {busy === 'pull' && <Bar p={prog[`ollama:${pullName.trim()}`]} label="拉取中" />}
      {ollamaErr && (
        <Notice tone="warning" data-testid="ollama-error">
          {ollamaErr}
        </Notice>
      )}
      {ollama === null ? (
        <SkeletonList rows={2} />
      ) : ollama.length === 0 ? (
        !ollamaErr && (
          <EmptyState icon="🦙" title="Ollama 里还没有模型" description="输入模型名拉取一个吧。" />
        )
      ) : (
        <div className={styles.list}>
          {ollama.map((m) => (
            <div key={m.name} className={styles.card}>
              <div className={styles.cardHead}>
                <b className={styles.grow}>{m.name}</b>
                {m.params && <Badge tone="neutral">{m.params}</Badge>}
                {m.quant && <Badge tone="neutral">{m.quant}</Badge>}
                <span className={styles.hint}>{fmtBytes(m.size)}</span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`从 Ollama 删除 ${m.name}？`))
                      void run(`od:${m.name}`, () => localClient.ollamaDelete(m.name), loadOllama);
                  }}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const color = (cal: string) =>
    sources?.find((s) => s.id === cal)?.color ?? 'var(--cd-color-accent)';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const saveEvent = async () => {
    if (!newEv || !newEv.summary.trim()) return;
    const start = new Date(`${newEv.date}T${newEv.time || '00:00'}`).getTime();
    const mins = Math.max(5, Number(newEv.mins) || 60);
    await run(
      'ev',
      () =>
        hubClient.calUpsert({
          summary: newEv.summary.trim(),
          start,
          end: newEv.time ? start + mins * 60_000 : start + 86_400_000,
          allDay: !newEv.time,
          rrule: newEv.rrule || undefined,
        }),
      loadCal,
    );
    setNewEv(null);
  };
  const calendar = (
    <div className={styles.stack}>
      <div className={styles.row}>
        <span className={styles.hint}>
          未来两周的日程，助手也能读取（工具 calendar_list），晨间简报会提到今天的安排。
        </span>
        <span className={styles.grow} />
        <Button
          size="sm"
          onClick={() => void run('imp', () => hubClient.calImport(), loadCal)}
          data-testid="cal-import"
        >
          导入 .ics
        </Button>
        <Button
          size="sm"
          onClick={() =>
            setNewSrc({ kind: 'ics-url', name: '', url: '', username: '', password: '' })
          }
          data-testid="cal-add-source"
        >
          订阅 / CalDAV
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setNewEv({ summary: '', date: ymd, time: '10:00', mins: '60', rrule: '' })}
          data-testid="cal-new"
        >
          ＋ 新日程
        </Button>
      </div>
      {newEv && (
        <div className={styles.card} data-testid="cal-editor">
          <div className={styles.row}>
            <Input
              className={styles.grow}
              size="sm"
              autoFocus
              placeholder="标题，例如：组会"
              value={newEv.summary}
              onChange={(e) => setNewEv({ ...newEv, summary: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveEvent();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setNewEv(null);
                }
              }}
              data-testid="cal-summary"
            />
            <Input
              size="sm"
              type="date"
              value={newEv.date}
              onChange={(e) => setNewEv({ ...newEv, date: e.target.value })}
            />
            <Input
              size="sm"
              type="time"
              value={newEv.time}
              onChange={(e) => setNewEv({ ...newEv, time: e.target.value })}
              aria-label="开始时间（留空为全天）"
            />
          </div>
          <div className={styles.row}>
            <div className={styles.selectBox}>
              <Select
                size="sm"
                value={newEv.mins}
                onChange={(e) => setNewEv({ ...newEv, mins: e.target.value })}
                options={[
                  { value: '30', label: '30 分钟' },
                  { value: '60', label: '1 小时' },
                  { value: '90', label: '1.5 小时' },
                  { value: '120', label: '2 小时' },
                ]}
              />
            </div>
            <div className={styles.selectBox}>
              <Select
                size="sm"
                value={newEv.rrule}
                onChange={(e) => setNewEv({ ...newEv, rrule: e.target.value })}
                options={[
                  { value: '', label: '不重复' },
                  { value: 'FREQ=DAILY', label: '每天' },
                  { value: 'FREQ=WEEKLY', label: '每周' },
                  { value: 'FREQ=MONTHLY', label: '每月' },
                ]}
              />
            </div>
            <span className={styles.grow} />
            <Button size="sm" onClick={() => setNewEv(null)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!newEv.summary.trim()}
              onClick={() => void saveEvent()}
              data-testid="cal-save"
            >
              保存
            </Button>
          </div>
        </div>
      )}
      {newSrc && (
        <div className={styles.card} data-testid="cal-source-editor">
          <div className={styles.row}>
            <div className={styles.selectBox}>
              <Select
                size="sm"
                value={newSrc.kind}
                onChange={(e) =>
                  setNewSrc({ ...newSrc, kind: e.target.value as 'ics-url' | 'caldav' })
                }
                options={[
                  { value: 'ics-url', label: 'ICS 订阅链接' },
                  { value: 'caldav', label: 'CalDAV 日历' },
                ]}
              />
            </div>
            <Input
              size="sm"
              placeholder="名称"
              value={newSrc.name}
              onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })}
            />
            <Input
              className={styles.grow}
              size="sm"
              placeholder="https://…"
              value={newSrc.url}
              onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })}
              data-testid="cal-source-url"
            />
          </div>
          {newSrc.kind === 'caldav' && (
            <div className={styles.row}>
              <Input
                size="sm"
                placeholder="用户名"
                value={newSrc.username}
                onChange={(e) => setNewSrc({ ...newSrc, username: e.target.value })}
              />
              <Input
                size="sm"
                type="password"
                placeholder="密码 / 应用专用密码（本机加密保存）"
                value={newSrc.password}
                onChange={(e) => setNewSrc({ ...newSrc, password: e.target.value })}
              />
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.hint}>只读同步，每 30 分钟刷新一次。</span>
            <span className={styles.grow} />
            <Button size="sm" onClick={() => setNewSrc(null)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!/^https?:\/\//.test(newSrc.url)}
              onClick={() => {
                const s = newSrc;
                setNewSrc(null);
                void run(
                  'src',
                  () => hubClient.calAddSource({ ...s, name: s.name || '订阅日历' }),
                  loadCal,
                );
              }}
              data-testid="cal-source-save"
            >
              添加并同步
            </Button>
          </div>
        </div>
      )}
      {sources && sources.length > 0 && (
        <div className={styles.row} data-testid="cal-sources">
          {sources.map((s) => (
            <span
              key={s.id}
              className={styles.check}
              title={
                s.lastError ||
                (s.lastSync
                  ? `上次同步 ${new Date(s.lastSync).toLocaleString('zh-CN', { hour12: false })}`
                  : '')
              }
            >
              <i className={styles.dot} style={{ background: s.color }} />
              <Switch
                checked={s.enabled}
                onChange={(v) =>
                  void run(`ct:${s.id}`, () => hubClient.calToggle(s.id, v), loadCal)
                }
                aria-label={`显示 ${s.name}`}
              />
              {s.name}
              {s.count !== undefined ? ` · ${s.count}` : ''}
              {s.lastError && <Badge tone="danger">同步失败</Badge>}
              {(s.kind === 'ics-url' || s.kind === 'caldav') && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void run(`cs:${s.id}`, () => hubClient.calSync(s.id), loadCal)}
                >
                  同步
                </Button>
              )}
              {s.kind !== 'local' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`移除日历「${s.name}」？`))
                      void run(`cr:${s.id}`, () => hubClient.calRemoveSource(s.id), loadCal);
                  }}
                >
                  移除
                </Button>
              )}
            </span>
          ))}
          <span className={styles.grow} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void run('cx', () => hubClient.calExport())}
          >
            导出 .ics
          </Button>
        </div>
      )}
      {sources === null ? (
        <SkeletonList rows={3} />
      ) : events.length === 0 ? (
        <EmptyState
          icon="📅"
          title="接下来两周没有日程"
          description="新建一个，或导入 / 订阅已有的日历。"
        />
      ) : (
        <div className={styles.list} data-testid="cal-events">
          {events.map((o) => (
            <div key={`${o.uid}:${o.start}`} className={styles.card}>
              <div className={styles.cardHead}>
                <i className={styles.dot} style={{ background: color(o.cal) }} />
                <b className={styles.grow}>{o.summary}</b>
                <span className={styles.hint}>{fmtWhen(o)}</span>
                {o.cal === 'local' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void run(`er:${o.uid}`, () => hubClient.calRemove(o.uid), loadCal)
                    }
                    aria-label={`删除 ${o.summary}`}
                  >
                    ✕
                  </Button>
                )}
              </div>
              {o.location && <div className={styles.meta}>📍 {o.location}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const clipboard = (
    <div className={styles.stack}>
      <div className={styles.row}>
        <label className={styles.check}>
          <Switch
            checked={!!clips?.settings.enabled}
            onChange={(v) =>
              void run('ce', () => hubClient.clipSettings({ enabled: v }), loadClips)
            }
            aria-label="记录剪贴板历史"
            data-testid="clip-enabled"
          />
          记录剪贴板历史（只存本机，默认关闭）
        </label>
        <label className={styles.check}>
          <Switch
            checked={!!clips?.settings.images}
            disabled={!clips?.settings.enabled}
            onChange={(v) => void run('ci', () => hubClient.clipSettings({ images: v }), loadClips)}
            aria-label="包含图片"
          />
          包含图片
        </label>
        <span className={styles.grow} />
        {!!clips?.items.length && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm('清空未固定的剪贴板历史？'))
                void run('cc', () => hubClient.clipClear(), loadClips);
            }}
          >
            清空
          </Button>
        )}
      </div>
      <p className={styles.hint}>看起来像密码、密钥、令牌的内容会自动跳过。</p>
      {clips === null ? (
        <SkeletonList rows={3} />
      ) : clips.items.length === 0 ? (
        <EmptyState
          icon="📋"
          title={clips.settings.enabled ? '还没有复制过内容' : '剪贴板历史未开启'}
          description={
            clips.settings.enabled
              ? '复制一段文字或图片试试。'
              : '开启后，最近复制的内容会出现在这里。'
          }
        />
      ) : (
        <div className={styles.list} data-testid="clip-list">
          {clips.items.map((c) => (
            <div key={c.id} className={styles.card} data-testid="clip-item">
              <div className={styles.cardHead}>
                <span className={styles.grow}>
                  {c.kind === 'text' ? (
                    <pre className={styles.clipText}>{c.text}</pre>
                  ) : (
                    <img
                      className={styles.clipImg}
                      src={c.thumb}
                      alt={`剪贴板图片 ${c.w}×${c.h}`}
                    />
                  )}
                </span>
                {c.pinned && <Badge tone="accent">已固定</Badge>}
              </div>
              <div className={styles.row}>
                <span className={styles.hint}>
                  {new Date(c.at).toLocaleString('zh-CN', { hour12: false })}
                </span>
                <span className={styles.grow} />
                <Button
                  size="sm"
                  onClick={() => void run(`cp:${c.id}`, () => hubClient.clipCopy(c.id))}
                  data-testid="clip-copy"
                >
                  复制
                </Button>
                {c.kind === 'image' ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const raw = await hubClient.clipImage(c.id);
                        onClose();
                        window.dispatchEvent(new CustomEvent('cd:attach-image', { detail: raw }));
                      } catch (e) {
                        setErr((e as Error).message);
                      }
                    }}
                    data-testid="clip-to-chat"
                  >
                    发到聊天
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      onClose();
                      window.dispatchEvent(new CustomEvent('cd:insert-text', { detail: c.text }));
                    }}
                    data-testid="clip-to-chat"
                  >
                    放进输入框
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run(`pn:${c.id}`, () => hubClient.clipPin(c.id, !c.pinned), loadClips)
                  }
                >
                  {c.pinned ? '取消固定' : '固定'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run(`rm:${c.id}`, () => hubClient.clipRemove(c.id), loadClips)
                  }
                  aria-label="删除"
                >
                  ✕
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const exportTab = (
    <div className={styles.stack}>
      <p className={styles.hint}>
        把你的数据打包成一个 .zip 文件，随时带走。API 密钥、CalDAV 密码等敏感信息不会被导出。
      </p>
      <div className={styles.presets}>
        {EXPORT_ITEMS.map((x) => (
          <label key={x.key} className={styles.check}>
            <Switch
              checked={exp.has(x.key)}
              onChange={(v) => {
                const n = new Set(exp);
                if (v) n.add(x.key);
                else n.delete(x.key);
                setExp(n);
              }}
              aria-label={x.label}
            />
            {x.label}
          </label>
        ))}
      </div>
      <div className={styles.row}>
        <Button
          variant="primary"
          disabled={!exp.size || !!busy}
          data-testid="export-run"
          onClick={() =>
            void run('exp', async () => {
              setExpDone('');
              const r = await hubClient.exportAll(
                [...exp],
                exp.has('conversations') ? collectConversations() : undefined,
              );
              if (r) setExpDone(`已导出到 ${r.file}（${fmtBytes(r.bytes)}）`);
            })
          }
        >
          {busy === 'exp' ? '打包中…' : '导出为 .zip'}
        </Button>
      </div>
      {expDone && (
        <Notice tone="success" data-testid="export-done">
          {expDone}
        </Notice>
      )}
    </div>
  );

  return (
    <Modal
      open={isVisible}
      onClose={() => {
        if (confirm) return setConfirm(null);
        onClose();
      }}
      title="本地中心（日历 / 剪贴板；本机小模型为辅助）"
      size="lg"
      data-testid="local-panel"
    >
      <div className={styles.stack}>
        <Tabs<Tab>
          items={[
            { value: 'calendar', label: '日历' },
            { value: 'clipboard', label: '剪贴板' },
            { value: 'export', label: '数据导出' },
            { value: 'models', label: running ? '本机小模型 · 运行中' : '本机小模型（辅助）' },
            { value: 'ollama', label: 'Ollama（可选）' },
          ]}
          value={tab}
          onChange={setTab}
          aria-label="本地中心"
        />
        {err && (
          <Notice tone="danger" data-testid="local-error">
            {err}
          </Notice>
        )}
        {!st && !err && <SkeletonList rows={3} />}
        {st && tab === 'models' && models}
        {st && tab === 'ollama' && ollamaTab}
        {tab === 'calendar' && calendar}
        {tab === 'clipboard' && clipboard}
        {tab === 'export' && exportTab}
      </div>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        data-testid="local-license-dialog"
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => confirm && void doDownload(confirm)}
              data-testid="local-license-accept"
            >
              同意许可并下载
            </Button>
          </>
        }
      >
        {confirm && (
          <div className={styles.stack}>
            <p>
              许可证：<b>{confirm.license}</b>（
              <a href={confirm.licenseUrl} target="_blank" rel="noreferrer">
                查看全文
              </a>
              ）
            </p>
            <p className={styles.hint}>
              大小约 {fmtBytes(confirm.bytes)}，来自{' '}
              <a href={confirm.sourceUrl} target="_blank" rel="noreferrer">
                官方模型卡
              </a>
              ，下载后会校验 SHA-256，可随时取消。
            </p>
            {confirm.extra && <p className={styles.hint}>{confirm.extra}</p>}
          </div>
        )}
      </Modal>
    </Modal>
  );
};
