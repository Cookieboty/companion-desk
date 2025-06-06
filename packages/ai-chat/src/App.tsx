import React, { useState } from 'react';
import { AiChatContextProvider } from './contexts/AiChatContext';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ModelSelector } from './components/ModelSelector';
import { ConfigPanel } from './components/ConfigPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAiChat } from './contexts/AiChatContext';
import './App.css';

const AiChatContent: React.FC = () => {
  const { state } = useAiChat();
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="ai-chat-app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">🤖 AI对话助手</h1>
        </div>
        <div className="header-right">
          <ModelSelector />
          <button
            className="config-button"
            onClick={() => setShowConfig(true)}
            title="模型配置"
          >
            ⚙️
          </button>
        </div>
      </header>

      <main className="app-main">
        <MessageList
          messages={state.messages}
          isLoading={state.isLoading}
        />
      </main>

      <footer className="app-footer">
        <MessageInput />
      </footer>

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