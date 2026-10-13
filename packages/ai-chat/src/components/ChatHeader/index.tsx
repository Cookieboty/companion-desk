/**
 * 对话窗口顶栏（参考 Codex app：右上角放常用入口，下面是对话）。
 * 图标打开右侧快速视图（抽屉），详细配置在「设置」里。
 */
import { Tooltip } from '@ig-live/ui';
import React from 'react';

import { extClient } from '../../services/extClient';
import { kbClient } from '../../services/kbClient';
import { memClient } from '../../services/memClient';
import { schedClient } from '../../services/schedClient';

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
  children?: React.ReactNode;
}

export const ChatHeader: React.FC<Props> = (p) => {
  const items = [
    {
      k: 'memory',
      tip: '记忆',
      key: '⌘/Ctrl+Shift+M',
      id: 'open-mem-panel',
      on: p.onMemory,
      show: memClient.available(),
    },
    {
      k: 'kb',
      tip: '知识库',
      key: '⌘/Ctrl+Shift+L',
      id: 'open-kb-panel',
      on: p.onKnowledge,
      show: kbClient.available(),
    },
    {
      k: 'sched',
      tip: '日程 · 编程助手进度',
      key: '⌘/Ctrl+Shift+D',
      id: 'open-sched-panel',
      on: p.onSchedule,
      show: schedClient.available(),
    },
    {
      k: 'ext',
      tip: '扩展 / MCP',
      key: '⌘/Ctrl+Shift+E',
      id: 'open-ext-panel',
      on: p.onExt,
      show: extClient.available(),
    },
    {
      k: 'local',
      tip: '本机管理（日历 · 剪贴板 · 小模型）',
      key: '⌘/Ctrl+Shift+J',
      id: 'open-local-panel',
      on: p.onLocal,
      show: extClient.available(),
    },
    {
      k: 'settings',
      tip: '设置',
      key: '⌘/Ctrl+,',
      id: 'open-settings',
      on: p.onSettings,
      show: true,
    },
  ].filter((i) => i.show);
  return (
    <header className={styles.header} data-testid="chat-header">
      <div className={styles.left}>{p.children}</div>
      <div className={styles.actions}>
        {items.map((i) => (
          <Tooltip key={i.id} placement="bottom" content={`${i.tip}  ${i.key}`}>
            <button
              type="button"
              className={styles.btn}
              onClick={i.on}
              aria-label={i.tip}
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
