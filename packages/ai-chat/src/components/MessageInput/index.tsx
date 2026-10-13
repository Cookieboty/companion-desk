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
  /** 打开统一设置页的某个分区 */
  onSettingsClick?: (section?: string) => void;
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
  onSettingsClick,
}) => {
  const [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
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

    // 斜杠命令：↑↓ 选择，Enter/Tab 执行，Esc 关闭
    if (slashOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSlashIdx((i) => (i + d + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        runCommand(slashMatches[Math.min(slashIdx, slashMatches.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMessage('');
        return;
      }
    }
    // ↑ 在空输入框里找回上一条提问（同 Codex）
    if (e.key === 'ArrowUp' && !message) {
      const last = [...state.messages].reverse().find((m) => m.role === 'user');
      if (last) {
        e.preventDefault();
        setMessage(last.content);
      }
      return;
    }

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
    setSlashIdx(0);

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

  const provOk = providerClientAvailable();
  const openModels = provOk ? () => onProvidersClick?.() : onConfigClick;
  type Cmd = {
    id: string;
    icon: string;
    label: string;
    hint?: string;
    testId: string;
    run: () => void;
    show: boolean;
    active?: boolean;
    /** 出现在 ＋ 菜单里（其余只走 / 命令、快捷键与顶栏/设置） */
    menu?: boolean;
  };
  const commands: Cmd[] = [
    {
      id: 'kb',
      icon: '📚',
      label: kbMode ? '知识库问答：开' : '知识库问答：关',
      hint: '⌘/Ctrl+Shift+K',
      testId: 'kb-mode-toggle',
      menu: true,
      run: toggleKb,
      show: kbAvailable,
      active: kbMode,
    },
    {
      id: 'snip',
      icon: '✂️',
      label: '截图提问',
      hint: '⌘/Ctrl+Shift+S',
      testId: 'snip-button',
      menu: true,
      run: () => void snip(),
      show: screenOk && !isDisabled && !snipping,
    },
    {
      id: 'model',
      icon: '⚙️',
      label: provOk ? '供应商与模型' : '配置模型',
      testId: 'open-config',
      menu: true,
      run: () => openModels?.(),
      show: true,
    },
    {
      id: 'voice',
      icon: '🎙',
      label: '语音设置',
      hint: 'F2 说话',
      testId: 'open-voice-settings',
      run: () => cv.setShowSettings(true),
      show: cv.v.available,
    },
    {
      id: 'kbm',
      icon: '🗂',
      label: '知识库管理',
      hint: '⌘/Ctrl+Shift+L',
      testId: 'open-kb-panel',
      run: () => onKnowledgeClick?.(),
      show: !!onKnowledgeClick && kbAvailable,
    },
    {
      id: 'memory',
      icon: '🧠',
      label: '长期记忆',
      hint: '⌘/Ctrl+Shift+M',
      testId: 'open-mem-panel',
      run: () => onMemoryClick?.(),
      show: !!onMemoryClick && memClient.available(),
    },
    {
      id: 'schedule',
      icon: '🗓',
      label: '日程 · 提醒 · 编程助手',
      hint: '⌘/Ctrl+Shift+D',
      testId: 'open-sched-panel',
      run: () => onScheduleClick?.(),
      show: !!onScheduleClick && schedClient.available(),
    },
    {
      id: 'screen',
      icon: '🖥',
      label: '截图与屏幕记忆',
      hint: '⌘/Ctrl+Shift+O',
      testId: 'open-screen-panel',
      run: () => onScreenClick?.(),
      show: !!onScreenClick && screenOk,
    },
    {
      id: 'ext',
      icon: '🧩',
      label: '扩展：MCP 与技能',
      hint: '⌘/Ctrl+Shift+E',
      testId: 'open-ext-panel',
      run: () => onExtClick?.(),
      show: !!onExtClick && extClient.available(),
    },
    {
      id: 'desktop',
      icon: '📁',
      label: '桌面能力',
      testId: 'open-desktop-panel',
      run: () => onDesktopClick?.(),
      show: !!onDesktopClick,
    },
    {
      id: 'local',
      icon: '🏠',
      label: '本地中心（辅助）',
      hint: '⌘/Ctrl+Shift+J',
      testId: 'open-local-panel',
      run: () => onLocalClick?.(),
      show: !!onLocalClick && extClient.available(),
    },
    {
      id: 'settings',
      icon: '⚙️',
      label: '全部设置…',
      hint: '⌘/Ctrl+,',
      testId: 'composer-settings',
      run: () => onSettingsClick?.(),
      show: !!onSettingsClick,
      menu: true,
    },
  ].filter((c) => c.show);
  const slashQuery = /^\/(\S*)$/.exec(message)?.[1];
  const slashMatches =
    slashQuery === undefined
      ? []
      : commands.filter(
          (c) => c.id.startsWith(slashQuery.toLowerCase()) || c.label.includes(slashQuery),
        );
  const slashOpen = slashMatches.length > 0;
  function runCommand(c: Cmd | undefined) {
    if (!c) return;
    setMenuOpen(false);
    setMessage('');
    c.run();
  }
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const renderItems = (list: Cmd[], slash: boolean) =>
    list.map((c, i) => (
      <button
        key={c.id}
        type="button"
        role="menuitem"
        className={`${styles.menuItem} ${slash && i === slashIdx ? styles.menuItemActive : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => runCommand(c)}
        data-testid={slash ? `slash-${c.id}` : c.testId}
        aria-pressed={c.active}
        title={c.label}
      >
        <span className={styles.menuIcon}>{c.icon}</span>
        <span className={styles.menuLabel}>{slash ? `/${c.id}` : c.label}</span>
        <span className={styles.menuHint}>{slash ? c.label : c.hint}</span>
      </button>
    ));

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
        {slashOpen && (
          <div className={styles.menu} role="menu" data-testid="slash-menu">
            {renderItems(slashMatches, true)}
          </div>
        )}
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

        <div className={styles.composerBar}>
          <div className={styles.moreWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="更多：知识库问答、截图、模型、设置（也可输入 / ）"
              aria-label="更多功能"
              data-testid="composer-more"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 5h2v14h-2zM5 11h14v2H5z" />
              </svg>
            </button>
            {menuOpen && (
              <div className={styles.menu} role="menu" data-testid="composer-menu">
                {renderItems(
                  commands.filter((c) => c.menu),
                  false,
                )}
              </div>
            )}
          </div>
          {kbMode && kbAvailable && (
            <button
              type="button"
              className={styles.chip}
              onClick={toggleKb}
              title="知识库问答已开启，点击关闭"
              data-testid="kb-mode-chip"
            >
              📚 知识库
            </button>
          )}
          <div className={styles.modelStatus}>
            {provOk ? (
              <ProviderSwitcher
                className={styles.currentModel}
                onManage={() => onProvidersClick?.()}
              />
            ) : state.models.filter((m) => m.enabled).length === 0 ? (
              <span className={styles.noModel}>没有可用的AI模型</span>
            ) : (
              <span className={styles.currentModel}>
                {state.models.find((m) => m.id === state.currentModelId)?.name || 'DeepSeek Chat'}
              </span>
            )}
          </div>
          <span className={styles.spacer} />
          <VoiceButtons cv={cv} disabled={disabled || !state.currentModelId} />
          <button
            onClick={handleSend}
            disabled={isDisabled || (!message.trim() && !images.length)}
            className={styles.sendButton}
            title="发送消息 (Enter)"
            aria-label="发送"
          >
            {state.isLoading ? (
              <div className={styles.loadingSpinner} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4l-7 7 1.4 1.4L11 7.8V20h2V7.8l4.6 4.6L19 11z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <VoiceSettingsModal cv={cv} />
    </div>
  );
};
