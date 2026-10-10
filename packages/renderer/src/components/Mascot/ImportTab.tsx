import { Button, Notice } from '@ig-live/ui';
import React, { useState } from 'react';

import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';

export const USER_MODEL_NOTICE =
  '自行导入的模型由你自己负责：请确认你有权使用它（参见模型作者的许可 / VRM 使用条件）。导入的模型只保存在本机，不会上传、同步或随应用分发。';

/** 导入本地 .vrm（文件对话框或拖放）。 */
export const ImportTab: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const api = window.electronAPI?.models;
  const { selectModel } = useMascot();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const run = async (filePath?: string) => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.importVrm(filePath);
      if (r.ok && r.model) {
        selectModel(r.model.id);
        onImported?.();
      } else if (r.error && r.error !== 'cancelled') {
        setError(r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="model-import">
      <Notice tone="warning" data-testid="user-model-notice">
        {USER_MODEL_NOTICE}
      </Notice>
      <div
        className={`${styles.dropZone} ${over ? styles.dropOver : ''}`}
        data-testid="vrm-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (!f || !api) return;
          if (!/\.vrm$/i.test(f.name)) {
            setError('请拖入 .vrm 文件');
            return;
          }
          void run(api.pathForFile(f));
        }}
      >
        <p>把 .vrm 文件拖到这里</p>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void run()}
          data-testid="import-vrm"
        >
          {busy ? '正在导入…' : '选择 VRM 文件…'}
        </Button>
        <p className={styles.credit}>
          支持 VRM 0.x / 1.0，最大 300 MB。导入后可在「我的角色」里调整缩放、取景、表情映射与动作。
        </p>
      </div>
      {error && (
        <Notice tone="danger" data-testid="import-error">
          {error}
        </Notice>
      )}
    </div>
  );
};
