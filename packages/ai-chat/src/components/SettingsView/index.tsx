/**
 * 统一设置页（参考 Codex app 的 Settings：左侧分区导航，右侧内容）。
 * 各分区直接复用原有面板，通过 ModalHostContext 以「内嵌」方式渲染，功能与 test id 不变。
 */
import { t } from '@nomi-ai/ui';
import { ModalHostContext } from '@nomi-ai/ui';
import { VoiceSettingsPanel, useVoice } from '@nomi-ai/voice';
import React, { useEffect, useMemo, useState } from 'react';

import { useAiChat } from '../../contexts/AiChatContext';
import { providerClientAvailable } from '../../services/providerClient';
import { ConfigPanel } from '../ConfigPanel';
import { DesktopPanel } from '../DesktopPanel';
import { ExtensionsPanel } from '../ExtensionsPanel';
import { KnowledgePanel } from '../KnowledgePanel';
import { LocalPanel } from '../LocalPanel';
import { MemoryPanel } from '../MemoryPanel';
import { onboardingClient } from '../Onboarding/client';
import { ProviderPanel } from '../ProviderPanel';
import { SchedulePanel } from '../SchedulePanel';
import { ScreenPanel } from '../ScreenPanel';

import styles from './index.module.css';
import { LanguageSettings } from './LanguageSettings';
import { PinsSettings } from './PinsSettings';
import { ThemeSettings } from './ThemeSettings';

export type SettingsSection =
  | 'general'
  | 'providers'
  | 'voice'
  | 'kb'
  | 'memory'
  | 'schedule'
  | 'agents'
  | 'screen'
  | 'ext'
  | 'desktop'
  | 'local'
  | 'privacy';

export const SETTINGS_SECTIONS: Array<{ id: SettingsSection; icon: string; label: string }> = [
  { id: 'general', icon: '⚙️', label: '通用' },
  { id: 'providers', icon: '🔑', label: '供应商与模型' },
  { id: 'voice', icon: '🎙', label: '语音' },
  { id: 'kb', icon: '📚', label: '知识库' },
  { id: 'memory', icon: '🧠', label: '记忆' },
  { id: 'schedule', icon: '🗓', label: '日程与提醒' },
  { id: 'agents', icon: '🤖', label: '编程助手' },
  { id: 'screen', icon: '🖥', label: '屏幕' },
  { id: 'ext', icon: '🧩', label: '扩展 / MCP' },
  { id: 'desktop', icon: '📁', label: '桌面权限' },
  { id: 'local', icon: '🏠', label: '本机小模型（辅助）' },
  { id: 'privacy', icon: '🔒', label: '隐私与数据' },
];

const SHORTCUTS: Array<[string, string]> = [
  ['⌘/Ctrl + ,', '打开设置'],
  ['⌘/Ctrl + B', '收起 / 展开侧栏'],
  ['/', '在输入框里打开命令'],
  ['Enter / Shift+Enter', '发送 / 换行'],
  ['↑（输入框为空时）', '找回上一条提问'],
  ['F2（按住）', '说话'],
  ['⌘/Ctrl + Shift + K', '知识库问答开关'],
  ['⌘/Ctrl + Shift + S', '截图提问'],
  ['⌘/Ctrl + Shift + M', '记忆'],
  ['⌘/Ctrl + Shift + L', '知识库'],
  ['⌘/Ctrl + Shift + D', '日程 · 编程助手'],
  ['⌘/Ctrl + Shift + E', '扩展 / MCP'],
  ['⌘/Ctrl + Shift + J', '本机管理'],
  ['⌘/Ctrl + Shift + O', '屏幕记忆'],
];

const VoiceSection: React.FC = () => {
  const v = useVoice('chat');
  if (!v.api) return <p className={styles.note}>{t('语音服务不可用（仅在桌面应用中提供）。')}</p>;
  return (
    <section className={styles.block} data-testid="settings-voice">
      <h2 className={styles.h2}>{t('语音输入')}</h2>
      <VoiceSettingsPanel api={v.api} config={v.config} onRefresh={() => void v.refresh()} />
    </section>
  );
};

interface Props {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  onClose: () => void;
}

export const SettingsView: React.FC<Props> = ({ section, onSection, onClose }) => {
  const { actions } = useAiChat();
  const [localTab, setLocalTab] = useState<'export' | undefined>();
  const inline = useMemo(() => ({ mode: 'inline' as const }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 子对话框打开时 Esc 交给它
      if (e.key === 'Escape' && !document.querySelector('.cd-modal-overlay')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const noop = () => undefined;
  const body = (() => {
    switch (section) {
      case 'general':
        return (
          <>
            <LanguageSettings />
            <section className={styles.block}>
              <h2 className={styles.h2}>{t('新手引导')}</h2>
              <p className={styles.muted}>
                {t('重新走一遍：语言、主题、角色与声音、称呼与语气、模型供应商和隐私说明。')}
              </p>
              <button
                type="button"
                className={styles.lang}
                data-testid="settings-reopen-onboarding"
                onClick={() => {
                  onClose();
                  void onboardingClient.reopen();
                }}
              >
                {t('重新打开新手引导')}
              </button>
            </section>
            <ThemeSettings />
            <PinsSettings />
            <ConfigPanel isVisible onClose={noop} />
            <section className={styles.block}>
              <h2 className={styles.h2}>{t('快捷键')}</h2>
              <dl className={styles.keys}>
                {SHORTCUTS.map(([k, d]) => (
                  <React.Fragment key={k}>
                    <dt>{t(k)}</dt>
                    <dd>{t(d)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          </>
        );
      case 'providers':
        return providerClientAvailable() ? (
          <ProviderPanel isVisible onClose={noop} />
        ) : (
          <p className={styles.note}>{t('供应商管理仅在桌面应用中可用；模型配置见「通用」。')}</p>
        );
      case 'voice':
        return <VoiceSection />;
      case 'kb':
        return <KnowledgePanel isVisible onClose={noop} />;
      case 'memory':
        return <MemoryPanel isVisible onClose={noop} />;
      case 'schedule':
        return <SchedulePanel key="s" isVisible onClose={noop} />;
      case 'agents':
        return <SchedulePanel key="a" isVisible onClose={noop} initialTab="agents" />;
      case 'screen':
        return <ScreenPanel isVisible onClose={noop} />;
      case 'ext':
        return <ExtensionsPanel isVisible onClose={noop} />;
      case 'desktop':
        return <DesktopPanel isVisible onClose={noop} />;
      case 'local':
        return (
          <LocalPanel
            key={localTab ?? 'models'}
            isVisible
            onClose={noop}
            initialTab={localTab ?? 'models'}
          />
        );
      case 'privacy':
        return (
          <section className={styles.block} data-testid="settings-privacy">
            <h2 className={styles.h2}>{t('隐私与数据')}</h2>
            <ul className={styles.list}>
              <li>{t('对话、记忆、知识库索引、屏幕记忆都只保存在这台电脑上，不做云同步。')}</li>
              <li>{t('编程助手进度只读取本机日志 / 状态文件，不登录、不抓取任何账号。')}</li>
              <li>{t('屏幕记忆可随时暂停；桌面文件访问需逐个文件夹授权，操作都有记录可撤销。')}</li>
            </ul>
            <div className={styles.actions}>
              <button
                type="button"
                className="cd-btn cd-btn--sm"
                onClick={() => onSection('memory')}
              >
                {t('管理记忆')}
              </button>
              <button
                type="button"
                className="cd-btn cd-btn--sm"
                onClick={() => onSection('screen')}
              >
                {t('屏幕记忆与排除')}
              </button>
              <button
                type="button"
                className="cd-btn cd-btn--sm"
                onClick={() => onSection('desktop')}
              >
                {t('文件夹授权与操作记录')}
              </button>
              <button
                type="button"
                className="cd-btn cd-btn--sm"
                data-testid="privacy-export"
                onClick={() => {
                  setLocalTab('export');
                  onSection('local');
                }}
              >
                {t('导出本地数据')}
              </button>
              <button
                type="button"
                className="cd-btn cd-btn--sm cd-btn--danger"
                data-testid="privacy-clear-chat"
                onClick={() => {
                  if (window.confirm(t('清空当前对话的消息？（其它对话不受影响）')))
                    void actions.clearChatHistory();
                }}
              >
                {t('清空当前对话')}
              </button>
            </div>
          </section>
        );
    }
  })();

  return (
    <div className={styles.settings} data-testid="settings-view">
      <nav className={styles.nav} aria-label={t('设置分区')}>
        <button
          type="button"
          className={styles.back}
          onClick={onClose}
          data-testid="settings-back"
          title={t('返回对话 (Esc)')}
        >
          {t('‹ 返回对话')}
        </button>
        <div className={styles.navTitle}>{t('设置')}</div>
        {SETTINGS_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.navItem} ${s.id === section ? styles.navActive : ''}`}
            aria-current={s.id === section ? 'page' : undefined}
            onClick={() => {
              setLocalTab(undefined);
              onSection(s.id);
            }}
            data-testid={`settings-nav-${s.id}`}
          >
            <span className={styles.navIcon}>{s.icon}</span>
            {t(s.label)}
          </button>
        ))}
      </nav>
      <main className={styles.content}>
        <div className={styles.inner}>
          <ModalHostContext.Provider value={inline}>{body}</ModalHostContext.Provider>
        </div>
      </main>
    </div>
  );
};
