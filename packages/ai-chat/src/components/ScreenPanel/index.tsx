/**
 * ScreenPanel —— 截图提问说明 + 本地屏幕记忆（默认关闭）：开关、间隔、保留期、
 * 排除的应用 / 窗口、时间线搜索、暂停与清空。数据只在本机 userData/screen-memory。
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
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  describeSkip,
  likelyVision,
  screenClient,
  type ScreenEntry,
  type ScreenState,
} from '../../services/screenClient';

import styles from './index.module.css';

type Tab = 'ask' | 'memory' | 'privacy';

const INTERVALS = [
  { value: '30', label: '每 30 秒' },
  { value: '60', label: '每 1 分钟' },
  { value: '120', label: '每 2 分钟' },
  { value: '300', label: '每 5 分钟' },
  { value: '600', label: '每 10 分钟' },
];
const RETENTIONS = [
  { value: '1', label: '保留 1 天' },
  { value: '3', label: '保留 3 天' },
  { value: '7', label: '保留 7 天' },
  { value: '14', label: '保留 14 天' },
  { value: '30', label: '保留 30 天' },
];

const fmt = (t: number) =>
  new Date(t).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const ScreenPanel: React.FC<{ isVisible: boolean; onClose: () => void }> = ({
  isVisible,
  onClose,
}) => {
  const [tab, setTab] = useState<Tab>('ask');
  const [st, setSt] = useState<ScreenState | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ScreenEntry[] | null>(null);
  const [pick, setPick] = useState<ScreenEntry | null>(null);
  const [newEx, setNewEx] = useState('');
  const [msg, setMsg] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setSt(await screenClient.state());
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  const search = useCallback(async (query: string) => {
    try {
      setItems(await screenClient.search(query));
    } catch (e) {
      setErr((e as Error).message);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    void search('');
    return screenClient.onChanged((s) => {
      setSt(s);
    });
  }, [isVisible, load, search]);

  useEffect(() => {
    if (!isVisible || tab !== 'memory') return;
    const t = setTimeout(() => void search(q), 200);
    return () => clearTimeout(t);
  }, [q, tab, isVisible, search, st?.count]);

  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        setTab((['ask', 'memory', 'privacy'] as Tab[])[Number(e.key) - 1]);
      } else if (e.key === '/' && tab === 'memory' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isVisible, tab]);

  const set = async (p: Parameters<typeof screenClient.setSettings>[0]) => {
    try {
      await screenClient.setSettings(p);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const s = st?.settings;
  const paused = !!s && s.pausedUntil > Date.now();
  const model = st?.chat?.model;

  const header = st && s?.enabled && (
    <div className={styles.indicator} data-testid="screen-indicator">
      <span className={paused ? styles.dotPaused : styles.dot} />
      {paused ? `屏幕记忆已暂停至 ${fmt(s.pausedUntil)}` : '屏幕记忆中 · 仅保存在本机'}
    </div>
  );

  return (
    <Modal
      open={isVisible}
      onClose={() => {
        if (pick) return;
        onClose();
      }}
      title="截图与屏幕记忆"
      size="lg"
      data-testid="screen-panel"
    >
      <div className={styles.stack}>
        <Tabs<Tab>
          items={[
            { value: 'ask', label: '截图提问' },
            { value: 'memory', label: `屏幕记忆${st?.count ? ` · ${st.count}` : ''}` },
            { value: 'privacy', label: '隐私与排除' },
          ]}
          value={tab}
          onChange={setTab}
          aria-label="截图与屏幕记忆"
        />
        {header}
        {err && <Notice tone="danger">{err}</Notice>}
        {!st && !err && <SkeletonList rows={3} />}

        {st && tab === 'ask' && (
          <div className={styles.stack}>
            <p className={styles.hint}>
              框选屏幕上的任意区域，连同问题一起发给对话模型。也可以直接把图片粘贴或拖进输入框。
            </p>
            <div className={styles.keys}>
              <span>
                <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> 在对话窗里截图
              </span>
              <span>
                <kbd>Ctrl/⌘</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> 任意界面截图提问
              </span>
              <span>
                框选后 <kbd>Enter</kbd> 确认 · <kbd>F</kbd> 整屏 · <kbd>Esc</kbd> 取消
              </span>
            </div>
            <Switch
              checked={s!.snipHotkey}
              onChange={(v) => void set({ snipHotkey: v })}
              label="启用全局截图快捷键 Ctrl/⌘+Alt+A"
            />
            <div className={styles.modelRow}>
              <span>当前对话模型：</span>
              <b>{st.chat ? `${st.chat.name}${model ? ` · ${model}` : ''}` : '未配置'}</b>
              {st.chat && (
                <Badge tone={st.chat.local ? 'success' : 'neutral'}>
                  {st.chat.local ? '本地' : '云端'}
                </Badge>
              )}
              {st.chat && (
                <Badge tone={likelyVision(model) ? 'success' : 'warning'}>
                  {likelyVision(model) ? '支持看图' : '可能不支持看图'}
                </Badge>
              )}
            </div>
            <Notice tone="info">
              想完全离线看图：在「供应商与模型」里添加 Ollama，并拉取视觉模型，例如
              <code> ollama pull qwen2.5vl:3b </code>或<code> llava </code>，再把它设为对话模型。
              {st.localOnly
                ? ' 已开启仅本地模式，图片不会发给云端。'
                : ' 云端模型第一次收到图片前会先征得你的同意。'}
            </Notice>
            <div className={styles.row}>
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  setTimeout(
                    () =>
                      window.dispatchEvent(
                        new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true }),
                      ),
                    50,
                  );
                }}
                data-testid="screen-panel-snip"
              >
                ✂️ 现在截图提问
              </Button>
            </div>
          </div>
        )}

        {st && tab === 'memory' && (
          <div className={styles.stack}>
            <div className={styles.row}>
              <Switch
                checked={s!.enabled}
                onChange={(v) => void set({ enabled: v, pausedUntil: 0 })}
                label="开启屏幕记忆（默认关闭）"
                data-testid="screen-mem-toggle"
              />
              <div className={styles.selectBox}>
                <Select
                  size="sm"
                  value={String(s!.intervalSec)}
                  options={INTERVALS}
                  onChange={(e) => void set({ intervalSec: Number(e.target.value) })}
                  data-testid="screen-interval"
                />
              </div>
              <div className={styles.selectBox}>
                <Select
                  size="sm"
                  value={String(s!.retentionDays)}
                  options={RETENTIONS}
                  onChange={(e) => void set({ retentionDays: Number(e.target.value) })}
                  data-testid="screen-retention"
                />
              </div>
              {s!.enabled &&
                (paused ? (
                  <Button size="sm" onClick={() => void screenClient.resume().then(load)}>
                    继续
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void screenClient.pause(60).then(load)}
                    data-testid="screen-pause"
                  >
                    暂停 1 小时
                  </Button>
                ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={!st.ocrReady}
                onClick={async () => {
                  setMsg('正在记录…');
                  const r = await screenClient
                    .sampleNow()
                    .catch((e: Error) => ({ saved: false, reason: e.message }));
                  setMsg(r.saved ? '已记录当前屏幕' : describeSkip(r.reason));
                  void search(q);
                }}
                data-testid="screen-sample-now"
              >
                立即记录一次
              </Button>
            </div>
            <p className={styles.hint}>
              开启后按间隔识别屏幕上的文字（本地
              OCR），只保存文字和小缩略图；画面没变化、电脑空闲或出现排除窗口时自动跳过。
              对话里可以问“我刚才在屏幕上看到的…”。
            </p>
            {!st.ocrReady && (
              <Notice tone="warning">
                需要先在「知识库 → OCR」下载中文 / 英文识别语言包（Ctrl/⌘+Shift+L）。
              </Notice>
            )}
            {(msg || st.lastSkip) && (
              <p className={styles.hint} data-testid="screen-msg">
                {msg || `上次跳过：${describeSkip(st.lastSkip)}`}
              </p>
            )}
            <Input
              ref={searchRef}
              size="sm"
              placeholder="搜索屏幕上出现过的文字…（/ 聚焦）"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="screen-search"
            />
            {items === null ? (
              <SkeletonList rows={3} />
            ) : items.length === 0 ? (
              <EmptyState
                icon="🖥"
                title={q ? '没有找到相关的屏幕记录' : '还没有屏幕记录'}
                description={
                  s!.enabled
                    ? '开着就好，我会在后台慢慢记。'
                    : '屏幕记忆默认关闭，打开上面的开关即可开始。'
                }
              />
            ) : (
              <div className={styles.timeline} data-testid="screen-timeline">
                {items.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={styles.entry}
                    onClick={() => setPick(e)}
                  >
                    {e.thumbUrl ? (
                      <img src={e.thumbUrl} alt="" className={styles.thumb} />
                    ) : (
                      <div className={styles.thumb} />
                    )}
                    <div className={styles.entryBody}>
                      <div className={styles.entryHead}>
                        <span>{fmt(e.at)}</span>
                        <span className={styles.muted}>{e.windows.slice(0, 2).join(' · ')}</span>
                      </div>
                      <div className={styles.entryText}>{e.text.slice(0, 140)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className={styles.row}>
              <Button
                size="sm"
                variant="danger"
                disabled={!st.count}
                onClick={async () => {
                  if (!window.confirm(`清空全部 ${st.count} 条屏幕记录？此操作不可撤销。`)) return;
                  await screenClient.clear();
                  void search(q);
                }}
              >
                清空全部记录
              </Button>
            </div>
          </div>
        )}

        {st && tab === 'privacy' && (
          <div className={styles.stack}>
            <p className={styles.hint}>
              屏幕上只要出现标题包含以下关键词的应用或窗口，整帧都不会记录（不区分大小写）。截图提问只在你主动框选时发生，不受此列表影响。
            </p>
            <div className={styles.chips} data-testid="screen-exclusions">
              {s!.exclusions.map((x) => (
                <span key={x} className={styles.chip}>
                  {x}
                  <button
                    type="button"
                    aria-label={`移除 ${x}`}
                    onClick={() => void set({ exclusions: s!.exclusions.filter((y) => y !== x) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className={styles.row}
              onSubmit={(e) => {
                e.preventDefault();
                const v = newEx.trim();
                if (!v) return;
                void set({ exclusions: [...s!.exclusions, v] });
                setNewEx('');
              }}
            >
              <div className={styles.grow}>
                <Input
                  size="sm"
                  placeholder="应用或窗口标题关键词，例如 微信、Slack、财务"
                  value={newEx}
                  onChange={(e) => setNewEx(e.target.value)}
                  data-testid="screen-exclusion-input"
                />
              </div>
              <Button size="sm" type="submit" disabled={!newEx.trim()}>
                添加排除
              </Button>
            </form>
            <Notice tone="info">
              屏幕记录只保存在本机，不会上传；只有当你在对话中询问、且模型调用「屏幕记忆搜索」时，相关文字片段才会发送给当前对话模型（云端模型会先征得同意）。
            </Notice>
          </div>
        )}
      </div>

      <Modal open={!!pick} onClose={() => setPick(null)} title={pick ? fmt(pick.at) : ''} size="lg">
        {pick && (
          <div className={styles.stack}>
            {pick.thumbUrl && <img src={pick.thumbUrl} alt="" className={styles.preview} />}
            <p className={styles.hint}>{pick.windows.join(' · ')}</p>
            <pre className={styles.ocr}>{pick.text}</pre>
            <div className={styles.row}>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await screenClient.remove(pick.id);
                  setPick(null);
                  void search(q);
                }}
              >
                删除这条
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Modal>
  );
};
