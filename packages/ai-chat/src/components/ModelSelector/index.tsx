import React, { useState } from 'react';
import { useAiChat } from '../../contexts/AiChatContext';
import { AIModelConfig } from '../../types/config';
import styles from './index.module.css';

export const ModelSelector: React.FC = () => {
  const { state, actions } = useAiChat();
  const [isOpen, setIsOpen] = useState(false);

  const currentModel = state.models.find(m => m.id === state.currentModelId);
  const enabledModels = state.models.filter(m => m.enabled);

  const handleModelSelect = (modelId: string) => {
    actions.setCurrentModel(modelId);
    setIsOpen(false);
  };

  const getModelStatusIcon = (model: AIModelConfig) => {
    if (model.isLocal) {
      return '🏠'; // 本地模型
    }
    switch (model.provider) {
      case 'deepseek':
        return '🧠';
      case 'openai':
        return '🤖';
      case 'claude':
        return '🎭';
      case 'ollama':
        return '🦙';
      default:
        return '⚡';
    }
  };

  if (enabledModels.length === 0) {
    return (
      <div className={styles.noModels}>
        <span>❌ 没有可用的AI模型</span>
        <button
          className={styles.configButton}
          onClick={() => {/* TODO: 打开配置面板 */ }}
        >
          配置模型
        </button>
      </div>
    );
  }

  return (
    <div className={styles.modelSelector}>
      <button
        className={styles.selectorButton}
        onClick={() => setIsOpen(!isOpen)}
        title="选择AI模型"
      >
        <div className={styles.currentModelInfo}>
          <span className={styles.modelIcon}>
            {currentModel ? getModelStatusIcon(currentModel) : '❓'}
          </span>
          <span className={styles.modelName}>
            {currentModel?.name || '选择模型'}
          </span>
        </div>
        <svg
          className={`${styles.dropdownIcon} ${isOpen ? styles.open : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span>选择AI模型</span>
            <button
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className={styles.modelList}>
            {enabledModels.map((model) => (
              <button
                key={model.id}
                className={`${styles.modelItem} ${model.id === state.currentModelId ? styles.active : ''
                  }`}
                onClick={() => handleModelSelect(model.id)}
              >
                <div className={styles.modelItemContent}>
                  <span className={styles.modelIcon}>
                    {getModelStatusIcon(model)}
                  </span>
                  <div className={styles.modelDetails}>
                    <span className={styles.modelName}>{model.name}</span>
                    <span className={styles.modelProvider}>
                      {model.provider} • {model.model}
                    </span>
                  </div>
                </div>
                {model.id === state.currentModelId && (
                  <span className={styles.activeIndicator}>✓</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.dropdownFooter}>
            <button
              className={styles.configButton}
              onClick={() => {
                setIsOpen(false);
                /* TODO: 打开配置面板 */
              }}
            >
              ⚙️ 管理模型
            </button>
          </div>
        </div>
      )}

      {/* 点击外部关闭下拉菜单 */}
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}; 