/**
 * 对话窗口顶栏（参考 Codex app：右上角放常用入口，下面是对话）。
 * 图标打开右侧快速视图（抽屉），详细配置在「设置」里。
 */
import { t } from '@nomi-ai/ui';
import { Tooltip } from '@nomi-ai/ui';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { extClient } from '../../services/extClient';
import { kbClient } from '../../services/kbClient';
import { memClient } from '../../services/memClient';
import { MAX_PINS, pinDef, pinHint, runPinCommand, togglePin, usePins } from '../../services/pins';
import { schedClient } from '../../services/schedClient';
import { formatCombo, useShortcutBindings } from '../../services/shortcuts';
import { AppIcon } from '../AppIcons';
import { ChatModeSwitch } from '../ChatModeSwitch';

import styles from './index.module.css';

const I: Record<string, React.ReactNode> = {
  memory: (
    <path d="M12 3a4 4 0 0 0-4 4 4 4 0 0 0-3 6.5A3.5 3.5 0 0 0 8.5 19H12m0-16a4 4 0 0 1 4 4 4 4 0 0 1 3 6.5 3.5 3.5 0 0 1-3.5 5.5H12m0-16v16" />
  ),
  kb: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7" />,
  sched: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17M8 14l2 2 4-4" />
    </>
  ),
  ext: (
    <path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4H4a2 2 0 1 1 0-4h2V6h4z" />
  ),
  local: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

interface Props {
  onMemory: () => void;
  onKnowledge: () => void;
  onSchedule: () => void;
  onExt: () => void;
  onLocal: () => void;
  onSettings: () => void;
  onNewChat: () => void;
  /** 打开 设置 → 通用 → 常驻入口 */
  onCustomize?: () => void;
  children?: React.ReactNode;
}

export const ChatHeader: React.FC<Props> = (p) => {
  const bindings = useShortcutBindings();
  const items = [
    {
      k: 'memory',
      tip: t('记忆'),
      key: formatCombo(bindings.memory),
      id: 'open-mem-panel',
      pin: 'memory',
      on: p.onMemory,
      show: memClient.available(),
    },
    {
      k: 'kb',
      tip: t('知识库'),
      key: formatCombo(bindings.kb),
      id: 'open-kb-panel',
      pin: 'kbm',
      on: p.onKnowledge,
      show: kbClient.available(),
    },
    {
      k: 'sched',
      tip: t('日程与提醒'),
      key: formatCombo(bindings.schedule),
      id: 'open-sched-panel',
      pin: 'schedule',
      on: p.onSchedule,
      show: schedClient.available(),
    },
    {
      k: 'ext',
      tip: t('扩展 / MCP'),
      key: formatCombo(bindings.ext),
      id: 'open-ext-panel',
      pin: 'ext',
      on: p.onExt,
      show: extClient.available(),
    },
    {
      k: 'local',
      tip: t('本机管理（日历 · 剪贴板 · 小模型）'),
      key: formatCombo(bindings.local),
      id: 'open-local-panel',
      pin: 'local',
      on: p.onLocal,
      show: extClient.available(),
    },
    {
      k: 'settings',
      tip: t('设置'),
      key: formatCombo(bindings.settings),
      id: 'open-settings',
      pin: 'settings',
      on: p.onSettings,
      show: true,
    },
  ].filter((i) => i.show);
  const { pins, update } = usePins();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [more, setMore] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 1000);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!menu && !more) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (e.target as Element).closest?.('[data-pin-popup]')) return;
      setMenu(null);
      setMore(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
    };
  }, [menu, more]);

  // 窄窗口：放不下的入口收进「⋯」
  const SLOT = 34;
  const fit =
    pins.length * SLOT <= width ? pins.length : Math.max(0, Math.floor((width - SLOT) / SLOT));
  const shown = pins.slice(0, fit);
  const hidden = pins.slice(fit);
  const run = (id: string) => {
    setMore(false);
    if (id === 'newchat') p.onNewChat();
    else runPinCommand(id);
  };
  const ctx = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMore(false);
    setMenu({ id, x: e.clientX, y: e.clientY });
  };
  const ctxPinned = menu ? pins.includes(menu.id) : false;
  const ctxFull = !ctxPinned && pins.length >= MAX_PINS;

  return (
    <header className={styles.header} data-testid="chat-header">
      <div className={styles.left} ref={leftRef} data-testid="header-pins">
        <ChatModeSwitch />
        {shown.map((id) => {
          const d = pinDef(id)!;
          return (
            <Tooltip
              key={id}
              placement="bottom"
              content={pinHint(d) ? `${t(d.label)}  ${pinHint(d)}` : t(d.label)}
            >
              <button
                type="button"
                className={`${styles.btn} ${styles.pin}`}
                onClick={() => run(id)}
                onContextMenu={ctx(id)}
                aria-label={t(d.label)}
                data-testid={`pin-${id}`}
              >
                <span aria-hidden>
                  <AppIcon icon={d.icon} size={16} />
                </span>
              </button>
            </Tooltip>
          );
        })}
        {hidden.length > 0 && (
          <div className={styles.moreWrap}>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setMore((v) => !v)}
              aria-label={t('更多入口（{0}）', hidden.length)}
              aria-expanded={more}
              title={t('更多入口')}
              data-testid="pins-overflow"
            >
              ⋯
            </button>
            {more && (
              <div className={styles.popup} role="menu" data-pin-popup>
                {hidden.map((id) => {
                  const d = pinDef(id)!;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      className={styles.popItem}
                      onClick={() => run(id)}
                      onContextMenu={ctx(id)}
                      data-testid={`pin-overflow-${id}`}
                    >
                      <span aria-hidden>
                        <AppIcon icon={d.icon} size={16} />
                      </span>
                      <span className={styles.popLabel}>{t(d.label)}</span>
                      {pinHint(d) && <span className={styles.popHint}>{pinHint(d)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {p.children}
      {menu && (
        <div
          className={`${styles.popup} ${styles.ctx}`}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          data-pin-popup
          data-testid="pin-context-menu"
        >
          <button
            type="button"
            role="menuitem"
            className={styles.popItem}
            disabled={ctxFull}
            onClick={() => {
              update(togglePin(pins, menu.id));
              setMenu(null);
            }}
            data-testid={ctxPinned ? 'pin-unpin' : 'pin-pin'}
          >
            📌{' '}
            {ctxPinned
              ? t('取消固定')
              : ctxFull
                ? t('左上角已满（最多 {0} 个）', MAX_PINS)
                : t('固定到左上角')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.popItem}
            onClick={() => {
              setMenu(null);
              p.onCustomize?.();
            }}
            data-testid="pin-customize"
          >
            {t('⚙️ 自定义常驻入口…')}
          </button>
        </div>
      )}
      <div className={styles.actions}>
        {items.map((i) => (
          <Tooltip key={i.id} placement="bottom" content={`${i.tip}  ${i.key}`}>
            <button
              type="button"
              className={styles.btn}
              onClick={i.on}
              onContextMenu={ctx(i.pin)}
              aria-label={t(i.tip)}
              data-testid={i.id}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {I[i.k]}
              </svg>
            </button>
          </Tooltip>
        ))}
      </div>
    </header>
  );
};
