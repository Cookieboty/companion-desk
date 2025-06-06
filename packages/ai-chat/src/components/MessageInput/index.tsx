import React, { useState, useRef, KeyboardEvent } from 'react';
import { useAiChat } from '../../contexts/AiChatContext';
import styles from './index.module.css';

interface MessageInputProps {
  onSend?: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onConfigClick?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  placeholder = '输入消息...',
  disabled = false,
  onConfigClick,
}) => {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { state, actions } = useAiChat();

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || state.isLoading) return;

    try {
      setMessage('');
      if (onSend) {
        onSend(trimmedMessage);
      } else {
        // 默认使用流式消息
        await actions.sendStreamMessage(trimmedMessage);
      }
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 处理输入法组合状态
    if (isComposing) return;

    // Ctrl/Cmd + Enter 发送消息
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
      return;
    }

    // Enter 发送消息（Shift + Enter 换行）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // 自动调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const isDisabled = disabled || state.isLoading || !state.currentModelId;

  return (
    <div className={styles.messageInputContainer}>
      {state.error && (
        <div className={styles.errorMessage}>
          ❌ {state.error}
        </div>
      )}

      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={isDisabled ? '请先选择AI模型...' : placeholder}
          disabled={isDisabled}
          className={styles.messageTextarea}
          rows={1}
        />

        <button
          onClick={handleSend}
          disabled={isDisabled || !message.trim()}
          className={styles.sendButton}
          title="发送消息 (Ctrl+Enter)"
        >
          {state.isLoading ? (
            <div className={styles.loadingSpinner} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </div>

      <div className={styles.inputHint}>
        <span>Enter 发送，Shift+Enter 换行</span>
        <div className={styles.modelStatus}>
          {state.models.filter(m => m.enabled).length === 0 ? (
            <span className={styles.noModel}>
              ❌ 没有可用的AI模型
            </span>
          ) : (
            <span className={styles.currentModel}>
              当前模型: {state.models.find(m => m.id === state.currentModelId)?.name || 'DeepSeek Chat'}
            </span>
          )}
          <button
            className={styles.configButton}
            onClick={onConfigClick}
            title="配置模型"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}; 