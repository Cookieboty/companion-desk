import type { ClientAIClient } from '@ig-live/ai-sdk-client';
import * as AISdkReact from '@ig-live/ai-sdk-client/react';
import { t } from '@ig-live/ui';
import { ModalHostContext, type ModalHost } from '@ig-live/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ChatHeader } from './components/ChatHeader';
import { ConfigPanel } from './components/ConfigPanel';
import { DesktopPanel } from './components/DesktopPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { KnowledgePanel } from './components/KnowledgePanel';
import { LocalPanel } from './components/LocalPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { MessageInput } from './components/MessageInput';
import { MessageList } from './components/MessageList';
import { OnboardingHost } from './components/Onboarding';
import { ProviderPanel } from './components/ProviderPanel';
import { SchedulePanel } from './components/SchedulePanel';
import { ScreenPanel } from './components/ScreenPanel';
import { SettingsView, type SettingsSection } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { AiChatContextProvider } from './contexts/AiChatContext';
import { useAiChat } from './contexts/AiChatContext';
import { desktopClient } from './services/desktopClient';
import { providerClient } from './services/providerClient';
import { screenClient, type ScreenState } from './services/screenClient';
import './App.css';

const AiChatContent: React.FC = () => {
  const { state, actions } = useAiChat();
  const [showConfig, setShowConfig] = useState(false);
  const [showProviders, setShowProviders] = useState(false);

  // 托盘「Provider 设置…」→ 主进程通知打开面板
  useEffect(() => providerClient.onOpenPanel(() => setShowProviders(true)), []);
  const [showDesktop, setShowDesktop] = useState(false);
  // 托盘「桌面能力…」→ 打开桌面能力面板
  useEffect(() => desktopClient.onOpenPanel(() => setShowDesktop(true)), []);
  const [showKb, setShowKb] = useState(false);
  // Ctrl/Cmd+Shift+L 打开知识库管理
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setShowKb((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [showMem, setShowMem] = useState(false);
  const [showSched, setShowSched] = useState(false);
  // Ctrl/Cmd+Shift+M 打开长期记忆
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowMem((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowSched((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShowExt((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setShowLocal((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setShowScreen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off1();
      off2();
      window.removeEventListener('keydown', onKey);
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
  // ⌘/Ctrl+B 收起/展开侧栏（与 Codex 一致）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  // ⌘/Ctrl+, 打开设置（与 Codex app 一致）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettings((s) => (s ? null : 'general'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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

  if (settings) {
    return (
      <div className="ai-chat-app">
        <SettingsView
          section={settings}
          onSection={setSettings}
          onClose={() => setSettings(null)}
        />
      </div>
    );
  }

  return (
    <div className="ai-chat-app">
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
        {/* 对话区域 */}
        <main className="chat-container">
          {state.messages.length === 0 ? (
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
        <AiChatContent />
        {/* 首次启动引导（未完成时覆盖在对话窗口上；设置 → 通用 可重新打开） */}
        <OnboardingHost />
      </AiChatContextProvider>
    </ErrorBoundary>
  );
}

export default App;
