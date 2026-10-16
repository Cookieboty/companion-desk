/**
 * 编程助手标签的会话视图（Codex Desktop 式交互思路）：
 * 用户消息右对齐气泡；助手消息 = 工具时间线 + Markdown 正文；
 * 运行中显示实时时间线 / 流式正文 / 权限卡 / 底部「正在处理」；贴底自动跟随，上滑不抢滚动条。
 */
import { Icon, t } from '@nomi-ai/ui';
import { ArrowDown, ChevronsUp, LoaderCircle, ShieldAlert } from 'lucide-react';
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { TabLive } from '../../contexts/HarnessTabsContext';
import type { HarnessTabMessage, HarnessTabMeta } from '../../services/harnessClient';
import { ENDPOINT_NAME } from '../../utils/endpointBadge';
import {
  buildTimeline,
  entriesFromLegacyTools,
  formatDuration,
  reduceTrace,
} from '../../utils/toolTrace';

import styles from './index.module.css';
import { Markdown } from './Markdown';
import { ToolTimeline } from './ToolTimeline';

/** 距底部不超过该像素视为「贴底」 */
export const NEAR_BOTTOM_PX = 48;

export function isNearBottom(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  px = NEAR_BOTTOM_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= px;
}

const NAMES: Record<string, string> = ENDPOINT_NAME;

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const AssistantMessage = memo(function AssistantMessage({
  message,
  backend,
}: {
  message: HarnessTabMessage;
  backend: string;
}) {
  const items = useMemo(() => {
    const entries = message.trace?.length
      ? reduceTrace(message.trace)
      : message.tools?.length
        ? entriesFromLegacyTools(message.tools)
        : [];
    return buildTimeline(entries);
  }, [message.trace, message.tools]);
  return (
    <div className={styles.assistant} data-testid="cli-msg-assistant">
      <ToolTimeline items={items} />
      {message.error ? (
        <div className={styles.error} role="alert">
          {message.content}
        </div>
      ) : (
        message.content.trim() && <Markdown text={message.content} />
      )}
      <div className={styles.meta}>
        <span>{NAMES[backend] ?? backend}</span>
        <span>{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
});

const UserMessage = memo(function UserMessage({ message }: { message: HarnessTabMessage }) {
  return (
    <div className={styles.user} data-testid="cli-msg-user">
      <div className={styles.userBubble} title={formatTime(message.timestamp)}>
        {message.content}
      </div>
    </div>
  );
});

/** 权限请求：醒目卡片 */
const PermissionCard: React.FC<{
  summary: string;
  onReply: (allow: boolean) => void;
}> = ({ summary, onReply }) => (
  <div
    className={styles.perm}
    data-testid="cli-permission-card"
    role="alertdialog"
    aria-label={t('需要确认工具权限')}
  >
    <div className={styles.permHead}>
      <Icon icon={ShieldAlert} size={16} />
      <span className={styles.permTitle}>{t('需要确认工具权限')}</span>
    </div>
    <code className={styles.permSummary}>{summary}</code>
    <div className={styles.permActions}>
      <button
        type="button"
        className={styles.permAllow}
        data-testid="cli-permission-allow"
        onClick={() => onReply(true)}
      >
        {t('允许')}
      </button>
      <button
        type="button"
        className={styles.permDeny}
        data-testid="cli-permission-deny"
        onClick={() => onReply(false)}
      >
        {t('拒绝')}
      </button>
    </div>
  </div>
);

/** 底部「正在处理」指示：带已用时间 */
const WorkingIndicator: React.FC<{ startedAt?: number; waiting?: boolean }> = ({
  startedAt,
  waiting,
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = startedAt ? Math.max(0, now - startedAt) : undefined;
  return (
    <div className={styles.working} data-testid="cli-working" role="status">
      <span className={styles.workingSpin}>
        <Icon icon={LoaderCircle} size={14} />
      </span>
      <span>{waiting ? t('等待你的确认…') : t('正在处理…')}</span>
      {elapsed !== undefined && elapsed >= 1000 && (
        <span className={styles.workingTime}>
          {formatDuration(Math.floor(elapsed / 1000) * 1000)}
        </span>
      )}
    </div>
  );
};

/** 首屏最多渲染的消息条数，以及按内容体量折算的预算（超大消息会让窗口变小） */
export const WINDOW_MESSAGES = 30;
export const WINDOW_BUDGET = 400;
export const LOAD_MORE_STEP = 30;

/** 估算一条消息的渲染成本：正文每 400 字符 1，每个轨迹事件 0.5，至少 1 */
function messageWeight(m: HarnessTabMessage): number {
  return Math.max(1, m.content.length / 400 + (m.trace?.length ?? 0) * 0.5);
}

/**
 * 长对话分页：从末尾往前取，直到条数达到 limit 或体量预算用完（至少 1 条）；返回起始下标。
 * `extra` 为用户点「显示更早的消息」追加的条数。
 */
export function windowStart(messages: readonly HarnessTabMessage[], extra = 0): number {
  const limit = WINDOW_MESSAGES + extra;
  let budget = WINDOW_BUDGET + extra * 10;
  let i = messages.length;
  while (i > 0 && messages.length - i < limit) {
    const w = messageWeight(messages[i - 1]!);
    if (budget - w < 0 && i < messages.length) break;
    budget -= w;
    i--;
  }
  return i;
}

export interface CliConversationProps {
  tab: HarnessTabMeta;
  messages: HarnessTabMessage[];
  live?: TabLive;
  onPermission: (requestId: string, allow: boolean) => void;
}

const CliConversationInner: React.FC<CliConversationProps> = ({
  tab,
  messages,
  live,
  onPermission,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 用户是否停在底部：贴底才自动跟随；上滑阅读时不抢滚动条 */
  const followRef = useRef(true);
  const [away, setAway] = useState(false);
  const running = tab.status === 'running';
  const queued = tab.status === 'queued';
  const [extra, setExtra] = useState(0);
  const start = useMemo(() => windowStart(messages, extra), [messages, extra]);
  const shown = start > 0 ? messages.slice(start) : messages;
  /** 点「显示更早」前的 scrollHeight：加载后据此保持视口不跳 */
  const anchorRef = useRef<number | null>(null);

  const liveTrace = live?.trace;
  const liveItems = useMemo(
    () => (liveTrace?.length ? buildTimeline(reduceTrace(liveTrace), running) : []),
    [liveTrace, running],
  );

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && anchorRef.current !== null) {
      el.scrollTop += el.scrollHeight - anchorRef.current;
      anchorRef.current = null;
    }
  }, [start]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    followRef.current = near;
    setAway((v) => (v === !near ? v : !near));
  }, []);

  // 首次挂载（切换标签时由外层 key 重建）：直接到底部
  useLayoutEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const last = messages[messages.length - 1];
  // 自己刚发了消息：无论滚到哪都跟到底
  const lastUserId = last?.role === 'user' ? last.id : undefined;
  useLayoutEffect(() => {
    if (lastUserId) {
      followRef.current = true;
      scrollToBottom();
    }
  }, [lastUserId, scrollToBottom]);

  // 内容增长（新消息 / 流式文本 / 新工具 / 权限卡 / 状态变化）时，贴底则跟随
  useLayoutEffect(() => {
    if (followRef.current) scrollToBottom();
  }, [
    messages.length,
    last?.id,
    live?.text,
    live?.trace?.length,
    live?.permission?.id,
    tab.status,
    scrollToBottom,
  ]);

  const showLive = running || queued;
  const waiting = !!live?.permission;

  return (
    <div className={styles.root} data-testid="cli-conversation" data-status={tab.status}>
      <div className={styles.scroll} ref={scrollRef} onScroll={onScroll} data-testid="cli-scroll">
        <div className={styles.inner}>
          {start > 0 && (
            <button
              type="button"
              className={styles.earlier}
              data-testid="cli-load-earlier"
              onClick={() => {
                anchorRef.current = scrollRef.current?.scrollHeight ?? null;
                setExtra((v) => v + LOAD_MORE_STEP);
              }}
            >
              <Icon icon={ChevronsUp} size={14} />
              {t('显示更早的 {0} 条消息', start)}
            </button>
          )}
          {shown.map((m) =>
            m.role === 'user' ? (
              <UserMessage key={m.id} message={m} />
            ) : (
              <AssistantMessage key={m.id} message={m} backend={tab.backend} />
            ),
          )}
          {showLive && (
            <div className={styles.assistant} data-testid="cli-tab-live" aria-live="polite">
              {queued ? (
                <div className={styles.queued}>{t('排队中：等待其它标签完成…')}</div>
              ) : (
                <>
                  <ToolTimeline items={liveItems} />
                  {live?.permission && (
                    <PermissionCard
                      summary={live.permission.summary}
                      onReply={(allow) => onPermission(live.permission!.id, allow)}
                    />
                  )}
                  {live?.text.trim() && <Markdown text={live.text} />}
                  {running && <WorkingIndicator startedAt={live?.startedAt} waiting={waiting} />}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {away && (
        <button
          type="button"
          className={styles.jump}
          data-testid="cli-jump-bottom"
          aria-label={t('回到底部')}
          title={t('回到底部')}
          onClick={() => {
            followRef.current = true;
            setAway(false);
            scrollToBottom();
          }}
        >
          <Icon icon={ArrowDown} size={16} />
        </button>
      )}
    </div>
  );
};

/** 以标签 id 为 key：切换标签即重建，滚动 / 展开状态互不串 */
export const CliConversation: React.FC<CliConversationProps> = (props) => (
  <CliConversationInner key={props.tab.id} {...props} />
);
