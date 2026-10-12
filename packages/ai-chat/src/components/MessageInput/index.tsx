import React, { useCallback, useEffect, useState, useRef, type KeyboardEvent } from 'react';

import { useAiChat } from '../../contexts/AiChatContext';
import { extClient } from '../../services/extClient';
import { kbClient } from '../../services/kbClient';
import { memClient } from '../../services/memClient';
import { providerClientAvailable } from '../../services/providerClient';
import { schedClient } from '../../services/schedClient';
import {
  MAX_ATTACHMENTS,
  attachmentFromFile,
  likelyVision,
  fromRaw,
  screenClient,
  type RawAttachment,
  type ImageAttachment,
} from '../../services/screenClient';
import { ErrorHint } from '../ErrorHint';
import { ProviderSwitcher } from '../ProviderSwitcher';
import { VoiceButtons, VoiceSettingsModal, VoiceStatusRow, useChatVoice } from '../VoiceInput';

import styles from './index.module.css';

interface MessageInputProps {
  onSend?: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onConfigClick?: () => void;
  onProvidersClick?: () => void;
  onDesktopClick?: () => void;
  onKnowledgeClick?: () => void;
  onMemoryClick?: () => void;
  onScheduleClick?: () => void;
  onScreenClick?: () => void;
  onExtClick?: () => void;
  onLocalClick?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  placeholder = '输入消息...',
  disabled = false,
  onConfigClick,
  onProvidersClick,
  onDesktopClick,
  onKnowledgeClick,
  onMemoryClick,
  onScheduleClick,
  onScreenClick,
  onExtClick,
  onLocalClick,
}) => {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { state, actions } = useAiChat();
  // 知识库问答模式（Ctrl/Cmd+Shift+K 切换），记住上次的选择
  const [kbMode, setKbMode] = useState(() => {
    try {
      return localStorage.getItem('cd.chat.kbMode') === '1';
    } catch {
      return false;
    }
  });
  const kbAvailable = kbClient.available();
  const toggleKb = useCallback(() => {
    setKbMode((v) => {
      try {
        localStorage.setItem('cd.chat.kbMode', v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);
  useEffect(() => {
    if (!kbAvailable) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleKb();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kbAvailable, toggleKb]);

  // ───── 图片附件：粘贴 / 拖入 / 截图提问 ─────
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [imgErr, setImgErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [snipping, setSnipping] = useState(false);
  const screenOk = screenClient.available();
  const addImages = useCallback((list: ImageAttachment[]) => {
    setImgErr('');
    setImages((cur) => {
      const next = [...cur, ...list];
      if (next.length > MAX_ATTACHMENTS) setImgErr(`最多附 ${MAX_ATTACHMENTS} 张图片`);
      return next.slice(0, MAX_ATTACHMENTS);
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);
  const addFiles = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'));
      if (!imgs.length) return false;
      const out: ImageAttachment[] = [];
      for (const f of imgs) {
        try {
          out.push(await attachmentFromFile(f));
        } catch (e) {
          setImgErr((e as Error).message);
        }
      }
      if (out.length) addImages(out);
      return true;
    },
    [addImages],
  );
  const snip = useCallback(async () => {
    if (!screenOk || snipping) return;
    setSnipping(true);
    setImgErr('');
    try {
      const a = await screenClient.snip();
      if (a) {
        addImages([a]);
        if (!textareaRef.current?.value) setMessage('这张截图里是什么？');
      }
    } catch (e) {
      setImgErr((e as Error).message);
    } finally {
      setSnipping(false);
    }
  }, [screenOk, snipping, addImages]);
  // 全局快捷键截图后，主进程把附件推过来
  useEffect(
    () =>
      screenClient.onAttachment((a) => {
        addImages([a]);
        setMessage((m) => m || '这张截图里是什么？');
      }),
    [addImages],
  );
  // 本地中心（剪贴板历史）发来的图片 / 文字
  useEffect(() => {
    const onImg = (e: Event) =>
      void fromRaw((e as CustomEvent<RawAttachment>).detail).then((a) => a && addImages([a]));
    const onText = (e: Event) => {
      const t = String((e as CustomEvent<string>).detail ?? '');
      setMessage((m) => (m ? `${m}\n${t}` : t));
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener('cd:attach-image', onImg);
    window.addEventListener('cd:insert-text', onText);
    return () => {
      window.removeEventListener('cd:attach-image', onImg);
      window.removeEventListener('cd:insert-text', onText);
    };
  }, [addImages]);
  useEffect(() => {
    if (!screenOk) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void snip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screenOk, snip]);
  const chatModel = state.currentModelId ?? '';
  const visionWarn =
    images.length > 0 &&
    !likelyVision(chatModel) &&
    !likelyVision(state.models.find((m) => m.id === chatModel)?.name);

  const handleSend = async () => {
    const trimmedMessage = message.trim() || (images.length ? '请看看这张图片。' : '');
    if (!trimmedMessage || state.isLoading) return;
    const sendImages = images;

    try {
      setMessage('');
      setImages([]);
      setImgErr('');
      if (sendImages.length) {
        await actions.sendStreamMessage(trimmedMessage, sendImages);
      } else if (onSend) {
        onSend(trimmedMessage);
      } else if (kbMode && kbAvailable) {
        await actions.askKnowledge(trimmedMessage);
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

  // 语音：自动发送（对话空闲时）或填入输入框
  const busyRef = useRef(false);
  busyRef.current = isDisabled;
  const onVoiceText = useCallback(
    (text: string, autoSend: boolean) => {
      if (autoSend && !busyRef.current) {
        void (onSend
          ? Promise.resolve(onSend(text))
          : kbMode && kbAvailable
            ? actions.askKnowledge(text)
            : actions.sendStreamMessage(text));
        return;
      }
      setMessage((m) => (m ? `${m} ${text}` : text));
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [onSend, actions, kbMode, kbAvailable],
  );
  const cv = useChatVoice({ disabled: disabled || !state.currentModelId, onText: onVoiceText });

  return (
    <div className={styles.messageInputContainer}>
      {state.error && <ErrorHint error={state.error} />}

      <div className={styles.voiceRow}>
        <VoiceStatusRow cv={cv} />
      </div>
      {(images.length > 0 || imgErr) && (
        <div className={styles.attachRow} data-testid="attach-row">
          {images.map((i) => (
            <div key={i.id} className={styles.attachItem} title={`${i.width}×${i.height}`}>
              <img src={i.thumb} alt="附件图片" className={styles.attachThumb} />
              <button
                type="button"
                className={styles.attachRemove}
                aria-label="移除图片"
                onClick={() => setImages((c) => c.filter((x) => x.id !== i.id))}
              >
                ×
              </button>
            </div>
          ))}
          <div className={styles.attachMeta}>
            {imgErr ? (
              <span className={styles.attachErr}>{imgErr}</span>
            ) : visionWarn ? (
              <span className={styles.attachWarn} data-testid="vision-warn">
                当前模型可能不支持看图，建议切换到视觉模型（如 qwen2.5vl、llava、gpt-4o）
              </span>
            ) : (
              <span className={styles.attachHint}>
                图片将随这条消息发送 · 原图不会保存在聊天记录里
              </span>
            )}
          </div>
        </div>
      )}
      <div
        className={`${styles.inputWrapper} ${dragOver ? styles.dragOver : ''}`}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((it) => it.type.startsWith('image/'))) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            void addFiles(files);
          }
        }}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.some((f) => f.type.startsWith('image/'))) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          placeholder={
            isDisabled
              ? '请先选择AI模型...'
              : kbMode && kbAvailable
                ? '向知识库提问，回答会标注出处…'
                : placeholder
          }
          disabled={isDisabled}
          className={styles.messageTextarea}
          rows={1}
        />

        {kbAvailable && (
          <button
            type="button"
            onClick={toggleKb}
            className={`${styles.kbToggle} ${kbMode ? styles.kbToggleOn : ''}`}
            aria-pressed={kbMode}
            title={
              kbMode
                ? '知识库问答：开（Ctrl/⌘+Shift+K 关闭）'
                : '知识库问答：关（Ctrl/⌘+Shift+K 开启）'
            }
            data-testid="kb-mode-toggle"
          >
            📚{kbMode && <span className={styles.kbToggleLabel}>知识库</span>}
          </button>
        )}
        {screenOk && (
          <button
            type="button"
            onClick={() => void snip()}
            className={styles.kbToggle}
            disabled={isDisabled || snipping}
            title="截图提问（Ctrl/⌘+Shift+S；任意界面 Ctrl/⌘+Alt+A）"
            data-testid="snip-button"
          >
            {snipping ? '…' : '✂️'}
          </button>
        )}
        <VoiceButtons cv={cv} disabled={disabled || !state.currentModelId} />
        <button
          onClick={handleSend}
          disabled={isDisabled || (!message.trim() && !images.length)}
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
        <span className={styles.hintText}>
          Enter 发送 · F2 说话{screenOk ? ' · ⌘/Ctrl+Shift+S 截图' : ''} · 可粘贴/拖入图片
          {kbAvailable ? ' · ⌘/Ctrl+Shift+K 知识库' : ''}
        </span>
        <div className={styles.modelStatus}>
          {providerClientAvailable() ? (
            <ProviderSwitcher
              className={styles.currentModel}
              onManage={() => onProvidersClick?.()}
            />
          ) : state.models.filter((m) => m.enabled).length === 0 ? (
            <span className={styles.noModel}>❌ 没有可用的AI模型</span>
          ) : (
            <span className={styles.currentModel}>
              当前模型:{' '}
              {state.models.find((m) => m.id === state.currentModelId)?.name || 'DeepSeek Chat'}
            </span>
          )}
          {cv.v.available && (
            <button
              className={styles.configButton}
              onClick={() => cv.setShowSettings(true)}
              title="语音输入设置"
              data-testid="open-voice-settings"
            >
              🎙
            </button>
          )}
          {onKnowledgeClick && kbAvailable && (
            <button
              className={styles.configButton}
              onClick={onKnowledgeClick}
              title="本地知识库（来源 / 索引 / OCR）"
              data-testid="open-kb-panel"
            >
              📚
            </button>
          )}
          {onMemoryClick && memClient.available() && (
            <button
              className={styles.configButton}
              onClick={onMemoryClick}
              title="长期记忆（Ctrl/⌘+Shift+M）"
              data-testid="open-mem-panel"
            >
              🧠
            </button>
          )}
          {onScheduleClick && schedClient.available() && (
            <button
              className={styles.configButton}
              onClick={onScheduleClick}
              title="日程与主动提醒（Ctrl/⌘+Shift+D）"
              data-testid="open-sched-panel"
            >
              🗓
            </button>
          )}
          {onScreenClick && screenOk && (
            <button
              className={styles.configButton}
              onClick={onScreenClick}
              title="截图与屏幕记忆（Ctrl/⌘+Shift+O）"
              data-testid="open-screen-panel"
            >
              🖥
            </button>
          )}
          {onExtClick && extClient.available() && (
            <button
              className={styles.configButton}
              onClick={onExtClick}
              title="扩展：MCP 与技能（Ctrl/⌘+Shift+E）"
              data-testid="open-ext-panel"
            >
              🧩
            </button>
          )}
          {onDesktopClick && (
            <button
              className={styles.configButton}
              onClick={onDesktopClick}
              title="桌面能力（文件授权 / 操作记录）"
              data-testid="open-desktop-panel"
            >
              📁
            </button>
          )}
          <button
            className={styles.configButton}
            onClick={providerClientAvailable() ? () => onProvidersClick?.() : onConfigClick}
            title={providerClientAvailable() ? '供应商与模型（第三方优先）' : '配置模型'}
            data-testid="open-config"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
            </svg>
          </button>
          {onLocalClick && extClient.available() && (
            <button
              className={`${styles.configButton} ${styles.auxButton}`}
              onClick={onLocalClick}
              title="本地中心（辅助：日历 / 剪贴板 / 可选本机小模型，Ctrl/⌘+Shift+J）"
              data-testid="open-local-panel"
              aria-label="本地中心"
            >
              🏠
            </button>
          )}
        </div>
      </div>
      <VoiceSettingsModal cv={cv} />
    </div>
  );
};
