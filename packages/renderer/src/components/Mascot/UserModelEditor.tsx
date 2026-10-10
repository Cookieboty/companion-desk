import type { ModelConfig } from '@ig-live/types';
import { Badge, Button, FormField, Input, Notice, Textarea } from '@ig-live/ui';
import React, { useState } from 'react';

import { USER_MODEL_NOTICE } from './ImportTab';
import styles from './style.module.css';

import type { MascotModel } from '@/mascot/catalog';
import { MOTION_LABELS } from '@/mascot/motion/library';

const num = (s: string): number | undefined =>
  s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s);

function parseMap(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const [k, v] = line.split('=').map((x) => x?.trim());
    if (k && v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 用户导入模型的设置：名字 / 缩放 / 偏移 / 取景 / 表情映射 / 动作；导出 / 导入配置；替换 / 删除。 */
export const UserModelEditor: React.FC<{ model: MascotModel; onDone: () => void }> = ({
  model,
  onDone,
}) => {
  const api = window.electronAPI?.models;
  const c = model.config ?? {};
  const [name, setName] = useState(model.displayName);
  const [scale, setScale] = useState(String(c.scale ?? ''));
  const [offsetY, setOffsetY] = useState(String(c.offset?.[1] ?? ''));
  const [camH, setCamH] = useState(String(c.camera?.height ?? ''));
  const [camD, setCamD] = useState(String(c.camera?.distance ?? ''));
  const [map, setMap] = useState(
    Object.entries(c.expressionMap ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  );
  const allMotions = Object.keys(MOTION_LABELS).filter((m) => m !== 'idle' && m !== 'talk');
  const [motions, setMotions] = useState<Set<string>>(new Set(c.motions ?? allMotions));
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const meta = model.meta;

  if (!api) return null;

  const config = (): ModelConfig => {
    const camera = { height: num(camH), distance: num(camD) };
    return {
      name: name.trim() || undefined,
      scale: num(scale),
      offset: num(offsetY) !== undefined ? [0, num(offsetY) as number, 0] : undefined,
      camera: camera.height !== undefined || camera.distance !== undefined ? camera : undefined,
      expressionMap: parseMap(map),
      motions: motions.size === allMotions.length ? undefined : [...motions],
    };
  };
  const report = (r: { ok: boolean; error?: string }, okText: string) =>
    setMsg(
      r.ok
        ? { tone: 'success', text: okText }
        : r.error === 'cancelled'
          ? null
          : { tone: 'danger', text: r.error ?? '失败' },
    );

  return (
    <div className={styles.editor} data-testid="user-model-editor">
      <div className={styles.creditHead}>
        <strong>{model.displayName}</strong>
        <Badge tone="warning">用户导入</Badge>
        {meta && <Badge tone="neutral">VRM {meta.version}</Badge>}
      </div>
      {meta && (
        <dl className={styles.metaList} data-testid="user-model-meta">
          <dt>作者</dt>
          <dd>{meta.author || '（未填写）'}</dd>
          <dt>许可</dt>
          <dd>{meta.license || '（未填写）'}</dd>
          <dt>允许使用者</dt>
          <dd>{meta.allowedUser || '—'}</dd>
          <dt>商用</dt>
          <dd>{meta.commercialUsage || '—'}</dd>
          <dt>再分发</dt>
          <dd>
            {meta.allowRedistribution === undefined
              ? '—'
              : meta.allowRedistribution
                ? '允许'
                : '不允许'}
          </dd>
        </dl>
      )}
      <Notice tone="warning">{USER_MODEL_NOTICE}</Notice>
      <div className={styles.formGrid}>
        <FormField label="名字">
          <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="cfg-name" />
        </FormField>
        <FormField label="缩放" hint="0.1 ~ 5，默认 1">
          <Input
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            inputMode="decimal"
            data-testid="cfg-scale"
          />
        </FormField>
        <FormField label="垂直偏移 (m)">
          <Input value={offsetY} onChange={(e) => setOffsetY(e.target.value)} inputMode="decimal" />
        </FormField>
        <FormField label="镜头高度 (m)" hint="默认 0.82">
          <Input value={camH} onChange={(e) => setCamH(e.target.value)} inputMode="decimal" />
        </FormField>
        <FormField label="镜头距离 (m)" hint="默认 3.2">
          <Input value={camD} onChange={(e) => setCamD(e.target.value)} inputMode="decimal" />
        </FormField>
      </div>
      <FormField
        label="表情映射"
        hint={`每行「通用名=模型表情名」，例如 happy=Joy。模型表情：${meta?.expressions.join(', ') || '—'}`}
      >
        <Textarea
          rows={3}
          value={map}
          onChange={(e) => setMap(e.target.value)}
          data-testid="cfg-expr"
        />
      </FormField>
      <div className={styles.motionChecks}>
        {allMotions.map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              checked={motions.has(m)}
              onChange={(e) => {
                const next = new Set(motions);
                if (e.target.checked) next.add(m);
                else next.delete(m);
                setMotions(next);
              }}
            />
            {MOTION_LABELS[m] ?? m}
          </label>
        ))}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className={styles.editorActions}>
        <Button
          variant="primary"
          data-testid="cfg-save"
          onClick={async () => report(await api.updateConfig(model.name, config()), '已保存')}
        >
          保存
        </Button>
        <Button onClick={async () => report(await api.exportConfig(model.name), '已导出配置')}>
          导出配置
        </Button>
        <Button onClick={async () => report(await api.importConfig(model.name), '已导入配置')}>
          导入配置
        </Button>
        <Button onClick={async () => report(await api.replaceVrm(model.name), '已替换 VRM 文件')}>
          替换 VRM…
        </Button>
        <Button
          variant="danger"
          data-testid="cfg-delete"
          onClick={async () => {
            if (!window.confirm(`删除导入的模型「${model.displayName}」？`)) return;
            const r = await api.remove(model.name);
            if (r.ok) onDone();
            else report(r, '');
          }}
        >
          删除
        </Button>
        <Button variant="ghost" onClick={onDone}>
          返回
        </Button>
      </div>
    </div>
  );
};
