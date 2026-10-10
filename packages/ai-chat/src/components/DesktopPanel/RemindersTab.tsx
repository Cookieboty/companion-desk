import { Badge, Button, EmptyState, Input, Select } from '@ig-live/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { desktopClient, type ReminderView } from '../../services/desktopClient';

import styles from './index.module.css';

const STATUS: Record<
  ReminderView['status'],
  { label: string; tone: 'neutral' | 'warning' | 'danger' | 'success' }
> = {
  pending: { label: '等待中', tone: 'neutral' },
  fired: { label: '已提醒', tone: 'success' },
  done: { label: '已完成', tone: 'success' },
  missed: { label: '错过', tone: 'warning' },
  cancelled: { label: '已取消', tone: 'danger' },
};

/** 提醒：应用运行时到点提醒（看板娘挥手 + 气泡 + 系统通知）；关闭期间错过的下次启动时播报。 */
export const RemindersTab: React.FC<{ onMsg: (m: string) => void }> = ({ onMsg }) => {
  const [items, setItems] = useState<ReminderView[]>([]);
  const [all, setAll] = useState(false);
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState('10');

  const load = useCallback(async () => setItems(await desktopClient.reminders(all)), [all]);
  useEffect(() => {
    void load();
    return desktopClient.onP2Changed((k) => k === 'reminders' && void load());
  }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    const r = await desktopClient.createReminder({ text, inMinutes: Number(minutes) });
    onMsg(r ? `好的，${new Date(r.dueAt).toLocaleTimeString()} 提醒你「${r.text}」` : '设置失败');
    setText('');
  };

  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Input
          placeholder="提醒我……"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="reminder-text"
          style={{ flex: 1 }}
        />
        <Select
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          options={[
            { value: '1', label: '1 分钟后' },
            { value: '5', label: '5 分钟后' },
            { value: '10', label: '10 分钟后' },
            { value: '30', label: '30 分钟后' },
            { value: '60', label: '1 小时后' },
            { value: '1440', label: '明天这时' },
          ]}
          data-testid="reminder-when"
        />
        <Button variant="primary" onClick={() => void add()} data-testid="reminder-add">
          添加
        </Button>
      </div>
      <label className={styles.hint}>
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{' '}
        显示已结束的提醒
      </label>
      {items.length === 0 ? (
        <EmptyState title="没有提醒" description="也可以在对话里说：「20 分钟后提醒我喝水」" />
      ) : (
        <table className={styles.table} data-testid="reminders-list">
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.dueAt).toLocaleString()}</td>
                <td>{r.text}</td>
                <td>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </td>
                <td className={styles.row}>
                  {r.status !== 'cancelled' && (
                    <Button size="sm" onClick={() => void desktopClient.snoozeReminder(r.id, 10)}>
                      推迟 10 分钟
                    </Button>
                  )}
                  {r.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void desktopClient.cancelReminder(r.id)}
                    >
                      取消
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
