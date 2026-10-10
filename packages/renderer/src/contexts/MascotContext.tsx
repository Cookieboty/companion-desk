import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import {
  loadCatalog,
  pickModel,
  readSelectedModel,
  writeSelectedModel,
  type MascotModel,
} from '@/mascot/catalog';

export interface MascotConfig {
  /** 工具栏按钮 id 列表 */
  tools: string[];
  /** 是否允许拖动窗口 */
  drag?: boolean;
}

export interface MascotState {
  currentMessage: string | null;
  messagePriority: number;
  dragEnabled: boolean;
  modelList: MascotModel[];
  /** 当前模型 name（model-list.json 中的 name） */
  modelName: string | null;
  pickerOpen: boolean;
  /** 其它浮层：动作菜单 / 致谢 */
  panel: 'motions' | 'credits' | null;
}

export type MascotAction =
  | { type: 'SET_MESSAGE'; payload: { text: string; priority: number; timeout?: number } }
  | { type: 'CLEAR_MESSAGE' }
  | { type: 'TOGGLE_DRAG'; payload: boolean }
  | { type: 'SET_MODEL_LIST'; payload: MascotModel[] }
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'SET_PICKER_OPEN'; payload: boolean }
  | { type: 'SET_PANEL'; payload: MascotState['panel'] };

const initialState: MascotState = {
  currentMessage: null,
  messagePriority: 0,
  dragEnabled: false,
  modelList: [],
  modelName: null,
  pickerOpen: false,
  panel: null,
};

export function mascotReducer(state: MascotState, action: MascotAction): MascotState {
  switch (action.type) {
    case 'SET_MESSAGE':
      if (state.currentMessage === null || action.payload.priority >= state.messagePriority) {
        return {
          ...state,
          currentMessage: action.payload.text,
          messagePriority: action.payload.priority,
        };
      }
      return state;
    case 'CLEAR_MESSAGE':
      return { ...state, currentMessage: null, messagePriority: 0 };
    case 'TOGGLE_DRAG':
      return { ...state, dragEnabled: action.payload };
    case 'SET_MODEL_LIST':
      return {
        ...state,
        modelList: action.payload,
        modelName: pickModel(action.payload, state.modelName)?.name ?? null,
      };
    case 'SET_MODEL':
      return { ...state, modelName: action.payload };
    case 'SET_PICKER_OPEN':
      return { ...state, pickerOpen: action.payload, panel: action.payload ? null : state.panel };
    case 'SET_PANEL':
      return {
        ...state,
        panel: action.payload,
        pickerOpen: action.payload ? false : state.pickerOpen,
      };
    default:
      return state;
  }
}

interface MascotContextType {
  state: MascotState;
  dispatch: React.Dispatch<MascotAction>;
  config: MascotConfig;
  currentModel: MascotModel | undefined;
  selectModel: (name: string) => void;
}

const MascotContext = createContext<MascotContextType | undefined>(undefined);

export const MascotProvider: React.FC<{ children: ReactNode; config: MascotConfig }> = ({
  children,
  config,
}) => {
  const [state, rawDispatch] = useReducer(mascotReducer, {
    ...initialState,
    dragEnabled: config.drag ?? false,
    modelName: readSelectedModel(),
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback((action: MascotAction) => {
    if (action.type === 'SET_MESSAGE' || action.type === 'CLEAR_MESSAGE') {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    rawDispatch(action);
    if (action.type === 'SET_MESSAGE') {
      timerRef.current = setTimeout(
        () => rawDispatch({ type: 'CLEAR_MESSAGE' }),
        action.payload.timeout || 3000,
      );
    }
  }, []);

  // 外部（托盘 / e2e）可通过 window 事件打开角色选择器
  useEffect(() => {
    const open = () => rawDispatch({ type: 'SET_PICKER_OPEN', payload: true });
    window.addEventListener('mascot:open-picker', open);
    return () => window.removeEventListener('mascot:open-picker', open);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadCatalog().then((models) => {
      if (alive) rawDispatch({ type: 'SET_MODEL_LIST', payload: models });
    });
    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const selectModel = useCallback((name: string) => {
    writeSelectedModel(name);
    rawDispatch({ type: 'SET_MODEL', payload: name });
  }, []);

  const currentModel = state.modelList.find((m) => m.name === state.modelName);

  return (
    <MascotContext.Provider value={{ state, dispatch, config, currentModel, selectModel }}>
      {children}
    </MascotContext.Provider>
  );
};

export const useMascot = (): MascotContextType => {
  const ctx = useContext(MascotContext);
  if (ctx === undefined) throw new Error('useMascot must be used within a MascotProvider');
  return ctx;
};
