import { t } from '@nomi-ai/ui';
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
      {/* Codex 风格：过程/工具信息是一行可折叠的紧凑行，默认收起 */}
      {!isUser && !!message.memories?.length && (
        <details className={styles.stepRow} data-testid="memory-tag">
          <summary>
            <span className={styles.stepIcon}>›</span>
            {t('参考了')} {message.memories.length} {t('条记忆')}
          </summary>
          <ul className={styles.stepBody}>
            {message.memories.map((m) => (
              <li key={m.id}>{t(m.title)}</li>
            ))}
          </ul>
        </details>
      )}

      <div className={`${styles.messageContent} ${isError ? styles.errorMessage : ''}`}>
        {!!message.images?.length && (
          <div className={styles.imageRow} data-testid="message-images">
            {message.images.map((im, i) => (
              <img
                key={i}
                src={im.thumb}
                alt={im.source === 'snip' ? t('截图') : t('图片')}
                className={styles.imageThumb}
                title={`${im.width}×${im.height}`}
              />
            ))}
          </div>
        )}
        {isError ? (
          <div className={styles.errorText}>{message.error}</div>
        ) : (
          <div className={styles.contentText}>
            {sources.length ? (
              <CitedText text={message.content} sources={sources} onPick={setPick} />
            ) : (
              message.content
            )}
          </div>
        )}
        {sources.length > 0 && (
          <details className={styles.stepRow} open>
            <summary>
              <span className={styles.stepIcon}>›</span>
              {message.kb ? t('知识库') : t('来源')} · {sources.length} {t('处出处')}
            </summary>
            <SourceList sources={sources} onPick={setPick} />
          </details>
        )}
      </div>
      <div className={styles.messageHeader}>
        <span className={styles.role}>{isUser ? t('你') : t('AI助手')}</span>
        <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
        {message.kb && !sources.length && <span className={styles.kbTag}>{t('知识库')}</span>}
        {message.modelId && <span className={styles.model}>{message.modelId}</span>}
      </div>
      <SourcePreview source={pick} onClose={() => setPick(null)} />
    </div>
  );
};
