import type { ModelDownloadProgress, StoreEntryView, StoreStateView } from '@ig-live/types';
import { Badge, Button, EmptyState, Notice } from '@ig-live/ui';
import React, { useCallback, useEffect, useState } from 'react';

import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';

const hostOf = (u?: string) => {
  try {
    return u ? new URL(u).host : '—';
  } catch {
    return '—';
  }
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** 模型商店：远程目录（只含开源许可模型），下载带进度 + sha256 校验，可更新 / 删除。 */
export const ModelStoreTab: React.FC = () => {
  const api = window.electronAPI?.models;
  const { state: mascot, selectModel } = useMascot();
  const [state, setState] = useState<StoreStateView | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, ModelDownloadProgress>>({});

  const load = useCallback(
    async (refresh: boolean) => {
      if (!api) return;
      setLoading(true);
      try {
        setState(await api.storeState(refresh));
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load(true);
    const offP = api?.onProgress((p) => setProgress((prev) => ({ ...prev, [p.id]: p })));
    const offC = api?.onChanged(() => void load(false));
    return () => {
      offP?.();
      offC?.();
    };
  }, [api, load]);

  if (!api) return <EmptyState title="模型商店仅在桌面应用中可用" />;

  const install = async (e: StoreEntryView) => {
    setProgress((p) => ({
      ...p,
      [e.id]: { id: e.id, received: 0, total: e.size, state: 'downloading' },
    }));
    await api.install(e.id);
  };

  return (
    <div data-testid="model-store">
      <div className={styles.storeBar}>
        <span className={styles.credit}>
          {state?.offline ? '离线：显示缓存的目录' : `目录：${hostOf(state?.catalogUrls[0])}`}
          {state?.fetchedAt ? ` · ${new Date(state.fetchedAt).toLocaleString()}` : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => void load(true)}
          data-testid="store-refresh"
        >
          {loading ? '刷新中…' : '刷新'}
        </Button>
      </div>
      {state?.error && !state.entries.length && (
        <Notice tone="warning" data-testid="store-error">
          无法获取模型目录：{state.error}
        </Notice>
      )}
      {!!state?.rejectedCount && (
        <Notice tone="warning">已忽略 {state.rejectedCount} 个不符合许可 / 安全要求的条目。</Notice>
      )}
      {state && !state.entries.length && !state.error && <EmptyState title="目录为空" />}
      <div className={styles.storeList}>
        {state?.entries.map((e) => {
          const p = progress[e.id];
          const busy = e.downloading || p?.state === 'downloading' || p?.state === 'verifying';
          const installed =
            !!e.installedVersion ||
            mascot.modelList.some((m) => m.name === e.id && m.origin === 'bundled');
          const pct = p && p.total ? Math.round((p.received / p.total) * 100) : 0;
          return (
            <div key={e.id} className={styles.storeItem} data-testid={`store-item-${e.id}`}>
              {e.thumbnailUrl ? (
                <img src={e.thumbnailUrl} alt={e.name} className={styles.thumb} />
              ) : (
                <div className={styles.thumb} />
              )}
              <div className={styles.storeInfo}>
                <div className={styles.creditHead}>
                  <strong>{e.name}</strong>
                  <Badge tone="success">{e.license}</Badge>
                  <Badge tone="neutral">v{e.version}</Badge>
                  {e.updateAvailable && <Badge tone="accent">有更新</Badge>}
                </div>
                <div className={styles.creditMeta}>
                  {e.author} · VRM {e.vrmVersion} · {mb(e.size)}
                </div>
                {busy && (
                  <div
                    className={styles.progress}
                    role="progressbar"
                    aria-valuenow={pct}
                    data-testid={`store-progress-${e.id}`}
                  >
                    <div style={{ width: `${pct}%` }} />
                  </div>
                )}
                {p?.state === 'error' && (
                  <div className={styles.errorText}>下载失败：{p.error}</div>
                )}
              </div>
              <div className={styles.storeActions}>
                {busy ? (
                  <Button size="sm" variant="ghost" onClick={() => void api.cancel(e.id)}>
                    取消
                  </Button>
                ) : e.installedVersion ? (
                  <>
                    {e.updateAvailable && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void install(e)}
                        data-testid={`store-update-${e.id}`}
                      >
                        更新
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => selectModel(e.id)}
                      data-testid={`store-use-${e.id}`}
                    >
                      使用
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void api.remove(e.id)}
                      data-testid={`store-remove-${e.id}`}
                    >
                      删除
                    </Button>
                  </>
                ) : installed ? (
                  <Badge tone="neutral">已内置</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void install(e)}
                    data-testid={`store-install-${e.id}`}
                  >
                    下载
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
