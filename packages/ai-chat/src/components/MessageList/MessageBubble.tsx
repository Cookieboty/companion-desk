import React, { useState } from 'react';

import type { KbSource } from '../../services/kbClient';
import { type ChatMessage } from '../../types/chat';

import { CitedText, SourceList, SourcePreview } from './Citations';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = !!message.error;
  const [pick, setPick] = useState<KbSource | null>(null);
  const sources = message.sources ?? [];

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`${styles.messageContainer} ${isUser ? styles.userMessage : styles.assistantMessage}`}
    >
      <div className={styles.messageHeader}>
        <span className={styles.role}>{isUser ? '你' : 'AI助手'}</span>
        <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
        {message.kb && <span className={styles.kbTag}>📚 知识库</span>}
        {!!message.memories?.length && (
          <span
            className={styles.kbTag}
            title={message.memories.map((m) => `· ${m.title}`).join('\n')}
            data-testid="memory-tag"
          >
            🧠 参考了 {message.memories.length} 条记忆
          </span>
        )}
        {message.modelId && <span className={styles.model}>{message.modelId}</span>}
      </div>

      <div className={`${styles.messageContent} ${isError ? styles.errorMessage : ''}`}>
        {isError ? (
          <div className={styles.errorText}>❌ {message.error}</div>
        ) : (
          <div className={styles.contentText}>
            {sources.length ? (
              <CitedText text={message.content} sources={sources} onPick={setPick} />
            ) : (
              message.content
            )}
          </div>
        )}
        {sources.length > 0 && <SourceList sources={sources} onPick={setPick} />}
      </div>
      <SourcePreview source={pick} onClose={() => setPick(null)} />
    </div>
  );
};
