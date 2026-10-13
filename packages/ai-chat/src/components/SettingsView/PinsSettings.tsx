/** 设置 → 通用 → 常驻入口：勾选要固定到左上角的功能，拖拽或 Alt+↑/↓ 排序，可恢复默认。 */
import React, { useState } from 'react';

import {
  DEFAULT_PINS,
  MAX_PINS,
  PIN_POOL,
  movePin,
  pinDef,
  togglePin,
  usePins,
} from '../../services/pins';

import styles from './index.module.css';

export const PinsSettings: React.FC = () => {
  const { pins, update } = usePins();
  const [drag, setDrag] = useState<number | null>(null);
  const [live, setLive] = useState('');
  const full = pins.length >= MAX_PINS;

  const move = (from: number, to: number) => {
    const next = movePin(pins, from, to);
    if (next === pins) return;
    update(next);
    setLive(`${pinDef(pins[from]!)!.label} 移到第 ${to + 1} 位`);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-testid="pin-order-${pins[from]}"]`)?.focus(),
    );
  };

  return (
    <section className={styles.block} data-testid="pins-settings" id="pins-settings">
      <h2 className={styles.h2}>常驻入口（左上角）</h2>
      <p className={styles.note}>
        选择要固定在对话窗口左上角的功能（最多 {MAX_PINS} 个）。拖动或用 Alt+↑/↓
        调整顺序；也可以在左上角图标上右键「取消固定」，或在 ＋ 菜单、右上角图标上固定。
      </p>
      <div className={styles.pinsGrid}>
        <div>
          <div className={styles.sub}>
            已固定 · {pins.length}/{MAX_PINS}
          </div>
          {pins.length === 0 && <div className={styles.note}>还没有固定任何入口</div>}
          <ol className={styles.order} aria-label="常驻入口顺序">
            {pins.map((id, i) => {
              const d = pinDef(id)!;
              return (
                <li
                  key={id}
                  tabIndex={0}
                  draggable
                  className={`${styles.orderItem} ${drag === i ? styles.dragging : ''}`}
                  onDragStart={(e) => {
                    setDrag(i);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag != null) move(drag, i);
                    setDrag(null);
                  }}
                  onDragEnd={() => setDrag(null)}
                  onKeyDown={(e) => {
                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
                    }
                  }}
                  aria-label={`${i + 1}. ${d.label}，Alt+↑/↓ 调整顺序`}
                  data-testid={`pin-order-${id}`}
                >
                  <span className={styles.grip} aria-hidden>
                    ⋮⋮
                  </span>
                  <span aria-hidden>{d.icon}</span>
                  <span className={styles.orderLabel}>{d.label}</span>
                  <button
                    type="button"
                    className={styles.mini}
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`上移${d.label}`}
                    data-testid={`pin-up-${id}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.mini}
                    onClick={() => move(i, i + 1)}
                    disabled={i === pins.length - 1}
                    aria-label={`下移${d.label}`}
                    data-testid={`pin-down-${id}`}
                  >
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="cd-btn cd-btn--sm"
            onClick={() => update([...DEFAULT_PINS])}
            data-testid="pins-reset"
          >
            恢复默认
          </button>
          <span className={styles.srOnly} aria-live="polite">
            {live}
          </span>
        </div>
        <div>
          <div className={styles.sub}>全部功能</div>
          <ul className={styles.pool}>
            {PIN_POOL.map((d) => {
              const on = pins.includes(d.id);
              return (
                <li key={d.id}>
                  <label className={`${styles.check} ${!on && full ? styles.checkOff : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && full}
                      onChange={() => update(togglePin(pins, d.id))}
                      data-testid={`pin-check-${d.id}`}
                    />
                    <span aria-hidden>{d.icon}</span>
                    <span className={styles.orderLabel}>{d.label}</span>
                    {d.shortcut && <span className={styles.hint}>{d.shortcut}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          {full && <div className={styles.note}>已达上限 {MAX_PINS} 个，先取消一个再添加。</div>}
        </div>
      </div>
    </section>
  );
};
