import React, { useEffect, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { ChatMessage } from '../../types/chat';
import { MessageBubble } from './MessageBubble';
import styles from './index.module.css';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

interface MessageItemProps {
  index: number;
  style: React.CSSProperties;
  data: ChatMessage[];
}

const MessageItem: React.FC<MessageItemProps> = ({ index, style, data }) => (
  <div style={style} className={styles.messageItem}>
    <MessageBubble message={data[index]} />
  </div>
);

export const MessageList: React.FC<MessageListProps> = ({ messages, isLoading }) => {
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length]);

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
        ref={listRef}
        height={400}
        itemCount={messages.length}
        itemSize={120} // 估算每条消息的高度
        itemData={messages}
        width="100%"
        className={styles.virtualList}
      >
        {MessageItem}
      </List>
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