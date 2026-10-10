import type { MascotInteractionConfig } from '@ig-live/types';
import { Button, Modal, Switch } from '@ig-live/ui';
import React, { useEffect, useState } from 'react';

import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';
import { interactionSettings } from '@/mascot/interaction/settings';

const ITEMS: Array<{ key: keyof MascotInteractionConfig; label: string; hint: string }> = [
  {
    key: 'clickThrough',
    label: '透明区域点击穿透',
    hint: '只有点在角色身上才会被拦截，其它地方的点击直接落到下面的窗口。',
  },
  {
    key: 'gravity',
    label: '重力与落地',
    hint: '松手后落到任务栏 / Dock 上方，可以把她扔出去（会反弹、撞墙）。',
  },
  { key: 'wander', label: '偶尔散步', hint: '闲着时沿屏幕底边走一走（约每 20~60 秒一次）。' },
  { key: 'reactions', label: '触摸反应', hint: '摸头、戳脸、点击、双击时的表情、动作与台词。' },
  { key: 'globalLook', label: '视线跟随全局鼠标', hint: '鼠标在窗口外时也看向它。' },
];

/** 互动设置面板（托盘 / 角色选择器 → 互动设置） */
export const InteractionSettings: React.FC = () => {
  const { state, dispatch } = useMascot();
  const [cfg, setCfg] = useState(interactionSettings.get());
  useEffect(() => interactionSettings.subscribe(setCfg), []);
  if (state.panel !== 'interaction') return null;
  return (
    <Modal
      open
      onClose={() => dispatch({ type: 'SET_PANEL', payload: null })}
      title="互动设置"
      data-testid="interaction-settings"
    >
      <ul className={styles.settingsList}>
        {ITEMS.map((it) => (
          <li key={it.key}>
            <Switch
              checked={cfg[it.key]}
              onChange={(v) => interactionSettings.set({ [it.key]: v })}
              label={it.label}
              data-testid={`interaction-${it.key}`}
            />
            <p className={styles.settingsHint}>{it.hint}</p>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <Button
          size="sm"
          variant="ghost"
          data-testid="interaction-wander-now"
          onClick={() => window.electronAPI?.mascotWindow?.wanderNow()}
        >
          现在走一走
        </Button>
      </div>
    </Modal>
  );
};

export default InteractionSettings;
