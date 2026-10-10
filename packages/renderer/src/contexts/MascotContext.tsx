import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import { lipSyncStore } from '@/ai/lipSyncStore';
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
  /** 气泡里显示「查看全文」（AI 回复被截短时） */
  messageMore?: boolean;
  dragEnabled: boolean;
  modelList: MascotModel[];
  /** 当前模型 name（model-list.json 中的 name） */
  modelName: string | null;
  pickerOpen: boolean;
  /** 其它浮层：动作菜单 / 致谢 */
  panel: 'motions' | 'credits' | 'interaction' | null;
}

export type MascotAction =
  | {
      type: 'SET_MESSAGE';
      payload: { text: string; priority: number; timeout?: number; more?: boolean };
    }
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
          messageMore: action.payload.more === true,
        };
      }
      return state;
    case 'CLEAR_MESSAGE':
      return { ...state, currentMessage: null, messagePriority: 0, messageMore: false };
    case 'TOGGLE_DRAG':
      return { ...state, dragEnabled: action.payload };
    case 'SET_MODEL_LIST':
      return {
        ...state,
        modelList: action.payload,
        modelName: pickModel(action.payload, state.modelName)?.name ?? null,
      };
    case 'SET_MODEL':
      // 未知 id（例如托盘里已被删除的模型）忽略
      if (state.modelList.length && !state.modelList.some((m) => m.name === action.payload))
        return state;
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

let lastSpokeAt = 0;
lipSyncStore.subscribe((rms) => {
  if (rms > 0.02) lastSpokeAt = Date.now();
});

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
      // TTS 正在说话（口型有能量）时不收起气泡，说完 1.5s 后再收
      const expire = () => {
        if (Date.now() - lastSpokeAt < 1500) {
          timerRef.current = setTimeout(expire, 400);
          return;
        }
        rawDispatch({ type: 'CLEAR_MESSAGE' });
      };
      timerRef.current = setTimeout(expire, action.payload.timeout || 3000);
    }
  }, []);

  // e2e / 调试：当前模型名
  useEffect(() => {
    document.documentElement.dataset.mascotModel = state.modelName ?? '';
  }, [state.modelName]);

  // 外部（托盘 / e2e）可通过 window 事件打开角色选择器
  useEffect(() => {
    const open = () => rawDispatch({ type: 'SET_PICKER_OPEN', payload: true });
    const openPanel = (e: Event) => {
      const panel = (e as CustomEvent<{ panel?: string }>).detail?.panel;
      if (panel === 'interaction' || panel === 'credits' || panel === 'motions')
        rawDispatch({ type: 'SET_PANEL', payload: panel });
    };
    window.addEventListener('mascot:open-picker', open);
    window.addEventListener('mascot:open-panel', openPanel);
    return () => {
      window.removeEventListener('mascot:open-picker', open);
      window.removeEventListener('mascot:open-panel', openPanel);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const reload = (force: boolean) =>
      void loadCatalog(fetch, force).then((models) => {
        if (alive) rawDispatch({ type: 'SET_MODEL_LIST', payload: models });
      });
    reload(false);
    // 商店安装 / 删除、用户导入后，主进程广播 models:changed
    const off = window.electronAPI?.models?.onChanged(() => reload(true));
    // 托盘 / AI 工具切换角色
    const onSelect = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (typeof id === 'string') {
        writeSelectedModel(id);
        rawDispatch({ type: 'SET_MODEL', payload: id });
      }
    };
    window.addEventListener('mascot:select-model', onSelect);
    return () => {
      alive = false;
      off?.();
      window.removeEventListener('mascot:select-model', onSelect);
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
