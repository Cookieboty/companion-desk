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
          <MessageInput onConfigClick={() => setShowConfig(true)} />
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