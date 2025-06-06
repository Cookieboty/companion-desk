import React, { useState } from 'react';
import { AiChatContextProvider } from './contexts/AiChatContext';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ModelSelector } from './components/ModelSelector';
import { ConfigPanel } from './components/ConfigPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { useAiChat } from './contexts/AiChatContext';
import './App.css';

const AiChatContent: React.FC = () => {
  const { state, actions } = useAiChat();
  const [showConfig, setShowConfig] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleNewChat = () => {
    actions.clearChatHistory();
  };

  return (
    <div className="ai-chat-app">
      {/* 侧边栏 */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNewChat={handleNewChat}
      />

      {/* 主内容区域 */}
      <div className="main-content">
        {/* 顶部标题栏 */}
        <header className="app-header">
          <div className="header-left">
            <h1 className="app-title">智能小助手</h1>
          </div>
          <div className="header-right">
            <ModelSelector />
            <button
              className="config-button"
              onClick={() => setShowConfig(true)}
              title="模型配置"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
              </svg>
            </button>
          </div>
        </header>

        {/* 对话区域 */}
        <main className="chat-container">
          {state.messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-content">
                <h2 className="welcome-title">开始新的对话</h2>
                <p className="welcome-subtitle">选择一个AI模型，然后开始与AI助手对话</p>
                <div className="quick-actions">
                  <button className="quick-action-btn" onClick={() => actions.sendMessage('你好，请介绍一下自己')}>
                    <span>👋</span>
                    <span>打个招呼</span>
                  </button>
                  <button className="quick-action-btn" onClick={() => actions.sendMessage('帮我写一段代码')}>
                    <span>💻</span>
                    <span>编程助手</span>
                  </button>
                  <button className="quick-action-btn" onClick={() => actions.sendMessage('解释一个概念')}>
                    <span>📚</span>
                    <span>学习助手</span>
                  </button>
                  <button className="quick-action-btn" onClick={() => actions.sendMessage('帮我分析问题')}>
                    <span>🔍</span>
                    <span>分析助手</span>
                  </button>
                  <button className="quick-action-btn" onClick={() => actions.sendMessage('帮我写一篇文章')}>
                    <span>✍️</span>
                    <span>写作助手</span>
                  </button>
                  <button className="quick-action-btn" onClick={() => actions.sendMessage('帮我翻译内容')}>
                    <span>🌐</span>
                    <span>翻译助手</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <MessageList
              messages={state.messages}
              isLoading={state.isLoading}
            />
          )}
        </main>

        {/* 输入区域 */}
        <footer className="input-container">
          <MessageInput />
        </footer>
      </div>

      {/* 配置面板 */}
      <ConfigPanel
        isVisible={showConfig}
        onClose={() => setShowConfig(false)}
      />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AiChatContextProvider>
        <AiChatContent />
      </AiChatContextProvider>
    </ErrorBoundary>
  );
}

export default App; 