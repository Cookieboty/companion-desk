import React, { createContext, useContext, useState, useReducer, ReactNode } from 'react';
import { Live2DProps } from '@/components/Live2D';

// 模型类型定义
export interface ModelItem {
  name: string;
  path: string;
  message?: string;
  textures?: string[];
}

// Live2D状态
export interface Live2DState {
  modelId: number;
  textureId: number;
  isLoading: boolean;
  currentMessage: string | null;
  messagePriority: number;
  showWidget: boolean;
  alwaysOnTop: boolean;
  modelList: ModelItem[];
  isInitialized: boolean;
  dragEnabled: boolean;
}

// Action类型
type Live2DAction =
  | { type: 'SET_MODEL_ID'; payload: number }
  | { type: 'SET_TEXTURE_ID'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_MESSAGE'; payload: { text: string; priority: number } }
  | { type: 'CLEAR_MESSAGE' }
  | { type: 'TOGGLE_WIDGET' }
  | { type: 'TOGGLE_ALWAYS_ON_TOP' }
  | { type: 'SET_MODEL_LIST'; payload: ModelItem[] }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'TOGGLE_DRAG'; payload: boolean };

// 初始状态
const initialState: Live2DState = {
  modelId: 0,
  textureId: 0,
  isLoading: true,
  currentMessage: null,
  messagePriority: 0,
  showWidget: true,
  alwaysOnTop: false,
  modelList: [],
  isInitialized: false,
  dragEnabled: false
};

// Reducer函数
function live2DReducer(state: Live2DState, action: Live2DAction): Live2DState {
  switch (action.type) {
    case 'SET_MODEL_ID':
      return { ...state, modelId: action.payload };
    case 'SET_TEXTURE_ID':
      return { ...state, textureId: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_MESSAGE':
      // 只有当新消息优先级高于当前消息时才更新
      if (state.currentMessage === null || action.payload.priority >= state.messagePriority) {
        return {
          ...state,
          currentMessage: action.payload.text,
          messagePriority: action.payload.priority
        };
      }
      return state;
    case 'CLEAR_MESSAGE':
      return {
        ...state,
        currentMessage: null,
        messagePriority: 0
      };
    case 'TOGGLE_WIDGET':
      return { ...state, showWidget: !state.showWidget };
    case 'TOGGLE_ALWAYS_ON_TOP':
      return { ...state, alwaysOnTop: !state.alwaysOnTop };
    case 'SET_MODEL_LIST':
      return { ...state, modelList: action.payload };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    case 'TOGGLE_DRAG':
      return { ...state, dragEnabled: action.payload };
    default:
      return state;
  }
}

// 创建Context
interface Live2DContextType {
  state: Live2DState;
  dispatch: React.Dispatch<Live2DAction>;
  config: Live2DProps;
}

const Live2DContext = createContext<Live2DContextType | undefined>(undefined);

// Provider组件
export const Live2DProvider: React.FC<{ children: ReactNode; config: Live2DProps }> = ({
  children,
  config
}) => {
  const [state, dispatch] = useReducer(live2DReducer, {
    ...initialState,
    dragEnabled: config.drag || false
  });

  return (
    <Live2DContext.Provider value={{ state, dispatch, config }}>
      {children}
    </Live2DContext.Provider>
  );
};

// 自定义Hook便于使用Context
export const useLive2D = () => {
  const context = useContext(Live2DContext);
  if (context === undefined) {
    throw new Error('useLive2D must be used within a Live2DProvider');
  }
  return context;
}; 