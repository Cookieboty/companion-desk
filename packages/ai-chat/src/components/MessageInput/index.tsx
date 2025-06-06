import React, { useState, useRef, KeyboardEvent } from 'react';
import { useAiChat } from '../../contexts/AiChatContext';
import styles from './index.module.css';

interface MessageInputProps {
  onSend?: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  placeholder = '输入消息...',
  disabled = false,
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
        {state.currentModelId && (
          <span className={styles.currentModel}>
            当前模型: {state.models.find(m => m.id === state.currentModelId)?.name || state.currentModelId}
          </span>
        )}
      </div>
    </div>
  );
}; 