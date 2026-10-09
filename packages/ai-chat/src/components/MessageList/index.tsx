import React, { useEffect, useRef } from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';

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

export const MessageList: React.FC<MessageListProps> = ({ messages, isLoading }) => {
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToRow({ index: messages.length - 1, align: 'end' });
    }
  }, [listRef, messages.length]);

  // 如果消息数量较少，使用普通渲染
  if (messages.length < 50) {
    return (
      <div className={styles.messageListContainer} ref={containerRef}>
        <div className={styles.messageListSimple}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isLoading && (
            <div className={styles.loadingIndicator}>
              <div className={styles.loadingDots}>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>AI正在思考中...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 大量消息使用虚拟滚动
  return (
    <div className={styles.messageListContainer} ref={containerRef}>
      <List
        listRef={listRef}
        rowComponent={MessageItem}
        rowCount={messages.length}
        rowHeight={120} // 估算每条消息的高度
        rowProps={{ messages }}
        style={{ height: 400, width: '100%' }}
        className={styles.virtualList}
      />
      {isLoading && (
        <div className={styles.loadingIndicator}>
          <div className={styles.loadingDots}>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>AI正在思考中...</span>
        </div>
      )}
    </div>
  );
};
