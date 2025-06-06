import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { ChatMessage, ChatConfig } from '../types/chat';
import { AIModelConfig } from '../types/config';
import { createIPCClient } from '../services/IPCClient';
import { IPCClient } from '../types/ipc';

interface AiChatState {
  messages: ChatMessage[];
  config: ChatConfig;
  models: AIModelConfig[];
  currentModelId?: string;
  isLoading: boolean;
  error?: string;
  ipcClient: IPCClient;
}

type AiChatAction =
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'SET_CONFIG'; payload: ChatConfig }
  | { type: 'SET_MODELS'; payload: AIModelConfig[] }
  | { type: 'SET_CURRENT_MODEL'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | undefined }
  | { type: 'CLEAR_MESSAGES' };

const initialState: AiChatState = {
  messages: [],
  config: {
    theme: 'light',
    language: 'zh-CN',
    fontSize: 14,
    autoSave: true,
    maxHistoryLength: 1000,
  },
  models: [],
  isLoading: false,
  ipcClient: createIPCClient(),
};

function aiChatReducer(state: AiChatState, action: AiChatAction): AiChatState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id
            ? { ...msg, content: action.payload.content }
            : msg
        ),
      };
    case 'SET_CONFIG':
      return { ...state, config: action.payload };
    case 'SET_MODELS':
      return { ...state, models: action.payload };
    case 'SET_CURRENT_MODEL':
      return { ...state, currentModelId: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };
    default:
      return state;
  }
}

interface AiChatContextType {
  state: AiChatState;
  dispatch: React.Dispatch<AiChatAction>;
  actions: {
    sendMessage: (content: string) => Promise<void>;
    sendStreamMessage: (content: string) => Promise<void>;
    loadChatHistory: () => Promise<void>;
    clearChatHistory: () => Promise<void>;
    loadConfig: () => Promise<void>;
    updateConfig: (config: Partial<ChatConfig>) => Promise<void>;
    loadModels: () => Promise<void>;
    updateModel: (modelId: string, updates: Partial<AIModelConfig>) => Promise<void>;
    setCurrentModel: (modelId: string) => void;
  };
}

const AiChatContext = createContext<AiChatContextType | undefined>(undefined);

export function AiChatContextProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(aiChatReducer, initialState);

  // 发送普通消息
  const sendMessage = async (content: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: undefined });

      // 添加用户消息
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now(),
        modelId: state.currentModelId,
      };
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

      // 发送到AI模型
      const response = await state.ipcClient.sendMessage(content, state.currentModelId);

      // 添加AI回复
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        modelId: state.currentModelId,
      };
      dispatch({ type: 'ADD_MESSAGE', payload: aiMessage });

      // 保存消息到历史
      await state.ipcClient.saveMessage(userMessage);
      await state.ipcClient.saveMessage(aiMessage);
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // 发送流式消息
  const sendStreamMessage = async (content: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: undefined });

      // 添加用户消息
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now(),
        modelId: state.currentModelId,
      };
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

      // 创建AI消息占位符
      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        modelId: state.currentModelId,
      };
      dispatch({ type: 'ADD_MESSAGE', payload: aiMessage });

      // 发送流式消息
      await state.ipcClient.sendStreamMessage(
        content,
        state.currentModelId,
        (chunk: string) => {
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: { id: aiMessageId, content: aiMessage.content + chunk },
          });
          aiMessage.content += chunk;
        }
      );
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // 加载对话历史
  const loadChatHistory = async () => {
    try {
      const history = await state.ipcClient.getChatHistory();
      dispatch({ type: 'SET_MESSAGES', payload: history });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };

  // 清空对话历史
  const clearChatHistory = async () => {
    try {
      await state.ipcClient.clearChatHistory();
      dispatch({ type: 'CLEAR_MESSAGES' });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };

  // 加载配置
  const loadConfig = async () => {
    try {
      const config = await state.ipcClient.getConfig();
      dispatch({ type: 'SET_CONFIG', payload: config });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };

  // 更新配置
  const updateConfig = async (config: Partial<ChatConfig>) => {
    try {
      await state.ipcClient.updateConfig(config);
      dispatch({ type: 'SET_CONFIG', payload: { ...state.config, ...config } });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };

  // 加载模型列表
  const loadModels = async () => {
    try {
      const models = await state.ipcClient.getAvailableModels();
      dispatch({ type: 'SET_MODELS', payload: models });

      // 如果没有当前模型，设置第一个可用模型
      if (!state.currentModelId && models.length > 0) {
        const enabledModel = models.find((m: AIModelConfig) => m.enabled) || models[0];
        dispatch({ type: 'SET_CURRENT_MODEL', payload: enabledModel.id });
      }
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };

  // 更新模型配置
  const updateModel = async (modelId: string, updates: Partial<AIModelConfig>) => {
    try {
      await state.ipcClient.updateModel(modelId, updates);
      // 重新加载模型列表
      await loadModels();
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    }
  };

  // 设置当前模型
  const setCurrentModel = (modelId: string) => {
    dispatch({ type: 'SET_CURRENT_MODEL', payload: modelId });
  };

  // 初始化数据
  useEffect(() => {
    loadConfig();
    loadModels();
    loadChatHistory();
  }, []);

  const contextValue: AiChatContextType = {
    state,
    dispatch,
    actions: {
      sendMessage,
      sendStreamMessage,
      loadChatHistory,
      clearChatHistory,
      loadConfig,
      updateConfig,
      loadModels,
      updateModel,
      setCurrentModel,
    },
  };

  return (
    <AiChatContext.Provider value={contextValue}>
      {children}
    </AiChatContext.Provider>
  );
}

export function useAiChat() {
  const context = useContext(AiChatContext);
  if (context === undefined) {
    throw new Error('useAiChat must be used within an AiChatContextProvider');
  }
  return context;
} 