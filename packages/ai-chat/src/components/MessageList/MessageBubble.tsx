import React from 'react';
import { ChatMessage } from '../../types/chat';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = !!message.error;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`${styles.messageContainer} ${isUser ? styles.userMessage : styles.assistantMessage}`}>
      <div className={styles.messageHeader}>
        <span className={styles.role}>
          {isUser ? '你' : 'AI助手'}
        </span>
        <span className={styles.timestamp}>
          {formatTime(message.timestamp)}
        </span>
        {message.modelId && (
          <span className={styles.model}>
            {message.modelId}
          </span>
        )}
      </div>

      <div className={`${styles.messageContent} ${isError ? styles.errorMessage : ''}`}>
        {isError ? (
          <div className={styles.errorText}>
            ❌ {message.error}
          </div>
        ) : (
          <div className={styles.contentText}>
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}; 