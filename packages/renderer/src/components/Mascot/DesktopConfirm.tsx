import type { DesktopConfirmRequest } from '@ig-live/types';
import { Badge, Button, Modal } from '@ig-live/ui';
import React, { useEffect, useState } from 'react';

import styles from './DesktopConfirm.module.css';

const DANGER: Record<
  DesktopConfirmRequest['danger'],
  { label: string; tone: 'neutral' | 'warning' | 'danger' }
> = {
  read: { label: '读取', tone: 'neutral' },
  write: { label: '写入', tone: 'warning' },
  destructive: { label: '破坏性', tone: 'danger' },
};

const REASON: Record<string, string> = {
  tainted: '这一轮刚读过文件内容，为防止文件里的内容诱导操作，需要再次确认。',
  destructive: '破坏性操作必须在这里确认（会移到回收站，可撤销）。',
  'first-use': '本次运行第一次使用这个工具。',
  policy: '',
};

/**
 * 桌面工具确认：先在看板娘气泡里问一句；详情对话框显示工具名、参数 JSON 与干跑预览。
 * 破坏性操作只能在对话框里确认，且确认按钮在打开后 1 秒内不可点（防误触）。120 秒未答复由主进程自动拒绝。
 */
export const DesktopConfirm: React.FC = () => {
  const [queue, setQueue] = useState<DesktopConfirmRequest[]>([]);
  const [detail, setDetail] = useState(false);
  const [armed, setArmed] = useState(false);
  const [remember, setRemember] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const api = window.electronAPI?.desktop;
  const cur = queue[0];

  useEffect(() => {
    if (!api) return;
    const off1 = api.onConfirmRequest((r) =>
      setQueue((q) => [...q.filter((x) => x.id !== r.id), r]),
    );
    const off2 = api.onConfirmCancel((id) => setQueue((q) => q.filter((x) => x.id !== id)));
    const off3 = api.onBubble((p) =>
      window.dispatchEvent(new CustomEvent('mascot:say', { detail: { text: p.text, ms: 9000 } })),
    );
    return () => {
      off1();
      off2();
      off3();
    };
  }, [api]);

  useEffect(() => {
    if (!cur) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cur]);

  useEffect(() => {
    setRemember(false);
    setDetail(false);
  }, [cur?.id]);

  useEffect(() => {
    if (!detail) return;
    setArmed(false);
    const t = setTimeout(() => setArmed(true), 1000);
    return () => clearTimeout(t);
  }, [detail, cur?.id]);

  if (!cur || !api) return null;
  const answer = (allow: boolean) => {
    api.answer(cur.id, allow, remember);
    setQueue((q) => q.slice(1));
  };
  const left = Math.max(0, Math.ceil((cur.expiresAt - now) / 1000));
  const d = DANGER[cur.danger];

  return (
    <>
      <div
        className={styles.bubble}
        data-mascot-ui
        data-testid="desktop-confirm-bubble"
        data-danger={cur.danger}
        data-tool={cur.tool}
      >
        <div className={styles.text}>{cur.summary}</div>
        <div className={styles.meta}>
          <Badge tone={d.tone}>{d.label}</Badge>
          <span>{left}s 后自动拒绝</span>
        </div>
        <div className={styles.actions}>
          {!cur.dialog && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => answer(true)}
              data-testid="desktop-confirm-allow"
            >
              允许
            </Button>
          )}
          <Button size="sm" onClick={() => setDetail(true)} data-testid="desktop-confirm-details">
            查看详情
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => answer(false)}
            data-testid="desktop-confirm-deny"
          >
            拒绝
          </Button>
        </div>
      </div>
      {detail && (
        <Modal
          open
          onClose={() => setDetail(false)}
          title="确认操作"
          data-testid="desktop-confirm-dialog"
        >
          <div className={styles.dialog}>
            <div className={styles.meta}>
              <Badge tone={d.tone}>{d.label}</Badge>
              <code>{cur.tool}</code>
            </div>
            <p className={styles.text}>{cur.summary}</p>
            {REASON[cur.reason] && <p className={styles.hint}>{REASON[cur.reason]}</p>}
            {cur.preview && (
              <>
                <div className={styles.label}>预览（尚未执行）</div>
                <pre className={styles.pre} data-testid="desktop-confirm-preview">
                  {cur.preview}
                </pre>
              </>
            )}
            <div className={styles.label}>参数</div>
            <pre className={styles.pre}>{cur.argsJson}</pre>
            {cur.rememberable && (
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  data-testid="desktop-remember"
                />
                本次运行不再询问这个工具
              </label>
            )}
            <div className={styles.actions}>
              <Button
                variant="ghost"
                onClick={() => answer(false)}
                data-testid="desktop-dialog-deny"
              >
                拒绝
              </Button>
              <Button
                variant={cur.danger === 'destructive' ? 'danger' : 'primary'}
                disabled={!armed}
                onClick={() => answer(true)}
                data-testid="desktop-dialog-allow"
              >
                {cur.danger === 'destructive' ? '确认执行' : '允许'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default DesktopConfirm;
