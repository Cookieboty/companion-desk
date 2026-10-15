import type { ClientAIClient } from '@nomi-ai/ai-sdk-client';
import * as AISdkReact from '@nomi-ai/ai-sdk-client/react';
import { t } from '@nomi-ai/ui';
import { ModalHostContext, type ModalHost } from '@nomi-ai/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ChatHeader } from './components/ChatHeader';
import { ChatTabs, CliTabInfo, CliTabLive, cliTabPlaceholder } from './components/ChatTabs';
import { CommandPalette, type PaletteCommand } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  ConfigPanel,
  DesktopPanel,
  ExtensionsPanel,
  KnowledgePanel,
  LocalPanel,
  MemoryPanel,
  ProviderPanel,
  SchedulePanel,
  ScreenPanel,
  SettingsView,
  prefetchPanels,
} from './components/lazyPanels';
import { MessageInput } from './components/MessageInput';
import { MessageList } from './components/MessageList';
import { OnboardingHost } from './components/Onboarding';
import { onboardingClient } from './components/Onboarding/client';
import { SETTINGS_SECTIONS, type SettingsSection } from './components/SettingsView/sections';
import { Sidebar } from './components/Sidebar';
import { AppTitleBar } from './components/TitleBar';
import { AiChatContextProvider } from './contexts/AiChatContext';
import { useAiChat } from './contexts/AiChatContext';
import { HarnessTabsProvider, useHarnessTabs } from './contexts/HarnessTabsContext';
import { useChatMode } from './hooks/useChatMode';
import { desktopClient } from './services/desktopClient';
import { providerClient } from './services/providerClient';
import { screenClient, type ScreenState } from './services/screenClient';
import {
  SHORTCUT_DEFS,
  formatCombo,
  isMac,
  matchShortcut,
  useShortcutBindings,
  type ShortcutId,
} from './services/shortcuts';
import { type ChatMessage } from './types/chat';
import './App.css';

const AiChatContent: React.FC = () => {
  const { state, actions } = useAiChat();
  const tabs = useHarnessTabs();
  const { isDev } = useChatMode();
  const [tabRename, setTabRename] = useState(0);
  const [tabNew, setTabNew] = useState(0);
  const cliMessages = useMemo<ChatMessage[]>(
    () =>
      tabs.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.error ? '' : m.content,
        timestamp: m.timestamp,
        modelId: m.role === 'assistant' ? tabs.activeTab?.backend : undefined,
        ...(m.error ? { error: m.content } : {}),
      })),
    [tabs.messages, tabs.activeTab?.backend],
  );
  const [showConfig, setShowConfig] = useState(false);
  const [showProviders, setShowProviders] = useState(false);

  // 托盘「Provider 设置…」→ 主进程通知打开面板
  // 首屏后空闲时预取设置 / 面板 chunk（不占首屏，打开时无需等待）
  useEffect(() => {
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: object) => number })
      .requestIdleCallback;
    const id = ric
      ? ric(prefetchPanels, { timeout: 2000 })
      : window.setTimeout(prefetchPanels, 500);
    return () => {
      if (ric) (window as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(id);
      else window.clearTimeout(id);
    };
  }, []);
  useEffect(() => providerClient.onOpenPanel(() => setShowProviders(true)), []);
  // mascot holds a thinking pose while a reply is being generated
  useEffect(() => {
    if (!state.isLoading) return;
    onboardingClient.mascot({ type: 'motion', name: 'think-on' });
    return () => onboardingClient.mascot({ type: 'motion', name: 'think-off' });
  }, [state.isLoading]);
  const [showDesktop, setShowDesktop] = useState(false);
  // 托盘「桌面能力…」→ 打开桌面能力面板
  useEffect(() => desktopClient.onOpenPanel(() => setShowDesktop(true)), []);
  const [showKb, setShowKb] = useState(false);
  const [showMem, setShowMem] = useState(false);
  const [showSched, setShowSched] = useState(false);
  const [showScreen, setShowScreen] = useState(false);
  const [showExt, setShowExt] = useState(false);
  const [showLocal, setShowLocal] = useState(false);
  const [screenSt, setScreenSt] = useState<ScreenState | null>(null);
  useEffect(() => {
    if (!screenClient.available()) return;
    void screenClient
      .state()
      .then(setScreenSt)
      .catch(() => undefined);
    const off1 = screenClient.onChanged(setScreenSt);
    const off2 = screenClient.onOpenPanel(() => setShowScreen(true));
    return () => {
      off1();
      off2();
    };
  }, []);
  const screenActive = !!screenSt?.settings.enabled && screenSt.settings.pausedUntil <= Date.now();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 720);
  // 窗口变窄时自动收起侧栏，避免挤压对话区
  useEffect(() => {
    const onResize = () => window.innerWidth < 720 && setSidebarCollapsed(true);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 切到普通模式时若正停在 CLI 标签，回到主对话（后台标签继续跑）
  useEffect(() => {
    if (isDev) return;
    if (tabs.isCliTab) void tabs.activate('main');
  }, [isDev, tabs.isCliTab, tabs]);

  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const openSettings = useCallback((sec: SettingsSection = 'general') => {
    setShowKb(false);
    setShowMem(false);
    setShowSched(false);
    setShowScreen(false);
    setShowExt(false);
    setShowLocal(false);
    setShowDesktop(false);
    setShowConfig(false);
    setShowProviders(false);
    setSettings(sec);
  }, []);
  // ---- 快捷键（可在设置 → 快捷键 改绑）+ ⌘/Ctrl+K 命令面板 ----
  const bindings = useShortcutBindings();
  const [palette, setPalette] = useState(false);
  const focusInput = useCallback(() => {
    setSettings(null);
    setTimeout(
      () => document.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')?.focus(),
      0,
    );
  }, []);
  const newChat = useCallback(() => {
    setSettings(null);
    actions.newConversation();
    focusInput();
  }, [actions, focusInput]);
  const shortcutActions = useMemo<Partial<Record<ShortcutId, () => void>>>(
    () => ({
      palette: () => setPalette((v) => !v),
      newChat,
      focusInput,
      settings: () => setSettings((s) => (s ? null : 'general')),
      sidebar: () => setSidebarCollapsed((v) => !v),
      kb: () => setShowKb((v) => !v),
      memory: () => setShowMem((v) => !v),
      schedule: () => setShowSched((v) => !v),
      ext: () => setShowExt((v) => !v),
      local: () => setShowLocal((v) => !v),
      screen: () => setShowScreen((v) => !v),
      newTab: () => {
        if (!isDev) return;
        setTabNew((n) => n + 1);
      },
      closeTab: () => {
        if (!isDev) return;
        if (tabs.activeTab) void tabs.close(tabs.activeTab.id);
      },
      nextTab: () => {
        if (!isDev) return;
        tabs.cycle(1);
      },
      prevTab: () => {
        if (!isDev) return;
        tabs.cycle(-1);
      },
      renameTab: () => {
        if (!isDev) return;
        setTabRename((n) => n + 1);
      },
    }),
    [newChat, focusInput, tabs, isDev],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      // 正在设置页里录制新快捷键时不触发
      if ((e.target as HTMLElement | null)?.closest?.('[data-shortcut-recording="true"]')) return;
      // 标签：Ctrl+Tab / Ctrl+Shift+Tab（各平台都用 Ctrl）与 Mod+1…9
      if (isDev && tabs.available && e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        tabs.cycle(e.shiftKey ? -1 : 1);
        return;
      }
      if (
        isDev &&
        tabs.available &&
        (isMac() ? e.metaKey : e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        /^Digit[1-9]$/.test(e.code)
      ) {
        e.preventDefault();
        tabs.selectIndex(Number(e.code.slice(5)) - 1);
        return;
      }
      for (const [id, run] of Object.entries(shortcutActions) as Array<[ShortcutId, () => void]>) {
        if (!matchShortcut(e, bindings[id])) continue;
        // 弹窗打开时只响应命令面板 / 面板开关，不在弹窗背后新建对话或抢焦点
        const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
        if (modal && (id === 'newChat' || id === 'focusInput')) return;
        if (modal && id === 'palette' && !modal.closest('[data-testid="command-palette"]')) return;
        e.preventDefault();
        run();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindings, shortcutActions, tabs, isDev]);
  // 快速视图：右侧抽屉 + 「在设置中打开」
  const drawerHost = useMemo(() => {
    const mk = (sec: SettingsSection): ModalHost => ({
      mode: 'drawer',
      onOpenSettings: () => openSettings(sec),
    });
    return {
      kb: mk('kb'),
      memory: mk('memory'),
      schedule: mk('schedule'),
      screen: mk('screen'),
      ext: mk('ext'),
      desktop: mk('desktop'),
      local: mk('local'),
    };
  }, [openSettings]);

  const handleNewChat = () => {
    actions.newConversation();
  };

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      ...SHORTCUT_DEFS.filter((d) => d.id !== 'palette' && shortcutActions[d.id]).map((d) => ({
        id: d.id,
        label: d.label,
        group: '操作',
        hint: formatCombo(bindings[d.id]),
        run: shortcutActions[d.id]!,
      })),
      ...SETTINGS_SECTIONS.map((sec) => ({
        id: `settings-${sec.id}`,
        label: sec.label,
        group: '设置',
        run: () => openSettings(sec.id),
      })),
    ],
    [bindings, shortcutActions, openSettings],
  );
  const paletteEl = (
    <CommandPalette open={palette} onClose={() => setPalette(false)} commands={paletteCommands} />
  );

  if (settings) {
    return (
      <div className="ai-chat-app">
        <AppTitleBar />
        <SettingsView
          section={settings}
          onSection={setSettings}
          onClose={() => setSettings(null)}
        />
        {paletteEl}
      </div>
    );
  }

  return (
    <div className="ai-chat-app">
      <AppTitleBar />
      {/* 侧边栏 */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNewChat={handleNewChat}
        onSettings={() => openSettings()}
      />

      {/* 主内容区域 */}
      <div className="main-content">
        <ChatHeader
          onMemory={() => setShowMem(true)}
          onKnowledge={() => setShowKb(true)}
          onSchedule={() => setShowSched(true)}
          onExt={() => setShowExt(true)}
          onLocal={() => setShowLocal(true)}
          onSettings={() => openSettings()}
          onNewChat={handleNewChat}
          onCustomize={() => openSettings('general')}
        >
          {screenActive && (
            <button
              type="button"
              className="screen-mem-indicator"
              onClick={() => setShowScreen(true)}
              title={t('屏幕记忆开启中（仅保存在本机），点击管理或暂停')}
              data-testid="screen-mem-indicator"
            >
              <span className="screen-mem-dot" />
              {t('屏幕记忆中')}
            </button>
          )}
        </ChatHeader>
        {isDev && (
          <ChatTabs
            renameRequest={tabRename}
            newTabRequest={tabNew}
            mainLoading={state.isLoading}
          />
        )}
        {isDev && <CliTabInfo />}
        {/* 对话区域 */}
        <main className="chat-container">
          {isDev && tabs.isCliTab ? (
            <>
              {cliMessages.length === 0 && !tabs.live[tabs.activeTab!.id] ? (
                <div className="welcome-screen" data-testid="cli-tab-empty">
                  <div className="welcome-content">
                    <h2 className="welcome-title">{t('{0} · 新会话', tabs.activeTab!.title)}</h2>
                    <p className="welcome-subtitle">
                      {t('消息会转发给本机编程助手；多个标签可以同时运行。')}
                    </p>
                  </div>
                </div>
              ) : (
                <MessageList messages={cliMessages} />
              )}
              <CliTabLive />
            </>
          ) : state.messages.length === 0 ? (
            <div className="welcome-screen" data-testid="welcome-screen">
              <div className="welcome-content">
                <h2 className="welcome-title">{t('今天想做点什么？')}</h2>
                <div className="quick-actions">
                  {[
                    [t('你好，请介绍一下自己'), t('打个招呼')],
                    [t('帮我写一段代码'), t('写一段代码')],
                    [t('帮我整理今天的待办'), t('整理今天的待办')],
                  ].map(([prompt, label]) => (
                    <button
                      key={label}
                      className="quick-action-btn"
                      onClick={() => actions.sendMessage(prompt)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="welcome-subtitle">
                  {t('输入 / 查看命令 · ＋ 打开知识库、语音、模型与设置')}
                </p>
              </div>
            </div>
          ) : (
            <MessageList messages={state.messages} isLoading={state.isLoading} />
          )}
        </main>

        {/* 输入区域 */}
        <footer className="input-container">
          <MessageInput
            {...(isDev && tabs.isCliTab
              ? {
                  onSend: (text: string) => void tabs.send(text),
                  busyOverride:
                    tabs.activeTab!.status === 'running' || tabs.activeTab!.status === 'queued',
                  placeholder: cliTabPlaceholder(tabs.activeTab!),
                }
              : {})}
            onConfigClick={() => setShowConfig(true)}
            onProvidersClick={() => setShowProviders(true)}
            onSettingsClick={(sec) => openSettings(sec as SettingsSection)}
            onDesktopClick={() => setShowDesktop(true)}
            onKnowledgeClick={() => setShowKb(true)}
            onMemoryClick={() => setShowMem(true)}
            onScheduleClick={() => setShowSched(true)}
            onScreenClick={() => setShowScreen(true)}
            onExtClick={() => setShowExt(true)}
            onLocalClick={() => setShowLocal(true)}
          />
        </footer>
      </div>

      {/* 模型配置保持为弹窗；日常功能为右侧抽屉（快速视图） */}
      {paletteEl}
      <ConfigPanel isVisible={showConfig} onClose={() => setShowConfig(false)} />
      <ProviderPanel isVisible={showProviders} onClose={() => setShowProviders(false)} />
      <ModalHostContext.Provider value={drawerHost.desktop}>
        <DesktopPanel isVisible={showDesktop} onClose={() => setShowDesktop(false)} />
      </ModalHostContext.Provider>
      <ModalHostContext.Provider value={drawerHost.kb}>
        <KnowledgePanel isVisible={showKb} onClose={() => setShowKb(false)} />
      </ModalHostContext.Provider>
      <ModalHostContext.Provider value={drawerHost.memory}>
        <MemoryPanel isVisible={showMem} onClose={() => setShowMem(false)} />
      </ModalHostContext.Provider>
      <ModalHostContext.Provider value={drawerHost.schedule}>
        <SchedulePanel isVisible={showSched} onClose={() => setShowSched(false)} />
      </ModalHostContext.Provider>
      <ModalHostContext.Provider value={drawerHost.screen}>
        <ScreenPanel isVisible={showScreen} onClose={() => setShowScreen(false)} />
      </ModalHostContext.Provider>
      <ModalHostContext.Provider value={drawerHost.ext}>
        <ExtensionsPanel isVisible={showExt} onClose={() => setShowExt(false)} />
      </ModalHostContext.Provider>
      <ModalHostContext.Provider value={drawerHost.local}>
        <LocalPanel isVisible={showLocal} onClose={() => setShowLocal(false)} />
      </ModalHostContext.Provider>
    </div>
  );
};

// 在 <AIProvider> 缺失时也不抛错：直接读 AISdkReact 未导出的内部 Context 是不推荐的，
// 因此改用 try/catch 包装 useAIClient，返回 undefined 让 AiChatContextProvider 走本地 Mock 分支。
function useOptionalAIClient(): ClientAIClient | undefined {
  const hook = (AISdkReact as { useAIClient?: () => ClientAIClient }).useAIClient;
  if (!hook) return undefined;
  try {
    return hook();
  } catch {
    return undefined;
  }
}

function App() {
  const client = useOptionalAIClient();
  return (
    <ErrorBoundary>
      <AiChatContextProvider client={client}>
        <HarnessTabsProvider>
          <AiChatContent />
        </HarnessTabsProvider>
        {/* 首次启动引导（未完成时覆盖在对话窗口上；设置 → 通用 可重新打开） */}
        <OnboardingHost />
      </AiChatContextProvider>
    </ErrorBoundary>
  );
}

export default App;
