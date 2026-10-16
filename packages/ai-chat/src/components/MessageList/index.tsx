import { t } from '@nomi-ai/ui';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { List, useDynamicRowHeight, useListRef, type RowComponentProps } from 'react-window';

import { type ChatMessage } from '../../types/chat';

import styles from './index.module.css';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

interface MessageItemProps {
  messages: ChatMessage[];
}

const MessageItem = ({
  index,
  style,
  messages,
  ariaAttributes,
}: RowComponentProps<MessageItemProps>) => (
  <div style={style} className={styles.messageItem} {...ariaAttributes}>
    <MessageBubble message={messages[index]} />
  </div>
);

/** 虚拟列表行的稳定 key：用消息 id，而不是下标（插入 / 删除 / 切换会话时不会串状态） */
export const messageRowKey = (index: number, { messages }: MessageItemProps): string =>
  messages[index]?.id ?? String(index);

/** 距底部不超过该像素视为「贴底」 */
const NEAR_BOTTOM_PX = 48;
/** 虚拟列表行高的初始估计值；真实高度由 useDynamicRowHeight 测量后替换 */
const ESTIMATED_ROW_HEIGHT = 120;
const VIRTUALIZE_THRESHOLD = 50;

export function isNearBottom(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  px = NEAR_BOTTOM_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= px;
}

/**
 * 流式回复开始前会先插入一条空的 assistant 占位消息；没有内容（也没出错 / 没图片）时不渲染，
 * 否则在第一个 chunk 到达前 / 流以空结果结束时会闪出一个空气泡。
 */
export function visibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (m) =>
      m.role !== 'assistant' ||
      !!m.error ||
      !!m.stopped ||
      !!m.images?.length ||
      !!m.content?.trim(),
  );
}

const Thinking: React.FC = () => (
  <div className={styles.loadingIndicator}>
    <div className={styles.loadingDots}>
      <span></span>
      <span></span>
      <span></span>
    </div>
    <span>{t('正在思考…')}</span>
  </div>
);

export const MessageList: React.FC<MessageListProps> = ({ messages: all, isLoading }) => {
  const messages = useMemo(() => visibleMessages(all), [all]);
  const virtual = messages.length >= VIRTUALIZE_THRESHOLD;
  const listRef = useListRef(null);
  const simpleRef = useRef<HTMLDivElement>(null);
  /** 用户当前是否停在底部：只有贴底（或自己刚发了消息 / 切换了会话）才自动跟随，上滚阅读时不抢滚动条 */
  const atBottomRef = useRef(true);
  const prev = useRef<{ count: number; firstId?: string }>({ count: 0 });

  // 切换会话后行高缓存作废（按首条消息 id 区分会话）
  const firstId = messages[0]?.id;
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: ESTIMATED_ROW_HEIGHT,
    key: firstId ?? 'empty',
  });
  const rowProps = useMemo(() => ({ messages }), [messages]);

  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    atBottomRef.current = isNearBottom(e.currentTarget);
  }, []);

  const last = messages[messages.length - 1];
  const lastLen = last?.content?.length ?? 0;
  const lastId = last?.id;
  const lastRole = last?.role;
  const count = messages.length;

  // 自动跟随：依赖「条数 + 最后一条的内容长度」（流式增长时持续贴底），而不是只看条数
  useEffect(() => {
    const before = prev.current;
    prev.current = { count, firstId };
    if (count === 0) return;
    const switched = before.firstId !== firstId;
    const appendedByUser = count > before.count && lastRole === 'user';
    if (!(switched || appendedByUser || atBottomRef.current)) return;
    atBottomRef.current = true;
    if (virtual) {
      listRef.current?.scrollToRow({ index: count - 1, align: 'end' });
    } else {
      const el = simpleRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [count, lastLen, lastId, lastRole, firstId, virtual, listRef]);

  // 少量消息：普通渲染
  if (!virtual) {
    return (
      <div className={styles.messageListContainer}>
        <div className={styles.messageListSimple} ref={simpleRef} onScroll={onScroll}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isLoading && <Thinking />}
        </div>
      </div>
    );
  }

  // 大量消息：虚拟滚动（动态行高 + 以消息 id 为 key）
  return (
    <div className={styles.messageListContainer}>
      <List
        listRef={listRef}
        rowComponent={MessageItem}
        rowCount={count}
        rowHeight={rowHeight}
        rowKey={messageRowKey}
        rowProps={rowProps}
        onScroll={onScroll}
        style={{ height: '100%', width: '100%' }}
        className={styles.virtualList}
      />
      {isLoading && <Thinking />}
    </div>
  );
};
