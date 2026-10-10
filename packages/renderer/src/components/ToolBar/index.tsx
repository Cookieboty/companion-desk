import { Switch, Tooltip } from '@ig-live/ui';
import {
  AudioLines,
  Bot,
  Ellipsis,
  Hand,
  Info,
  Layers,
  Mic,
  Pin,
  PinOff,
  Settings2,
  UserRound,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { VoiceService } from '../../services/VoiceService';
import { VoiceSettings } from '../VoiceSettings';

import {
  loadToolbarPrefs,
  saveToolbarPrefs,
  PALETTES,
  PRIMARY_TOOLS,
  type ToolbarPrefs,
} from './prefs';
import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';
import { useWaifuMessage } from '@/hooks/useWaifuMessage';
import { nextModel } from '@/mascot/catalog';
import { layoutStore, placeGutter, type GutterPlacement } from '@/mascot/layoutStore';
import { MESSAGES } from '@/mascot/tips';
import { getCache, setCache } from '@/utils/cache';

/**
 * 看板娘工具栏。
 * - 柔和配色（磨砂玻璃 + 低饱和强调色，无霓虹辉光），Lucide（ISC）统一图标，@ig-live/ui Tooltip。
 * - 独立图层（高于画布），放在角色包围盒旁的“预留槽位”，不压住角色；贴近屏幕边缘时翻到另一侧。
 * - 空闲自动隐藏，光标靠近角色 / 工具栏时出现；可收起为单个「更多」按钮。
 * - 显示时带 data-mascot-ui，点击穿透命中测试（Win/mac elementFromPoint、Linux setShape）都会算上它。
 */

let globalVoiceService: VoiceService | null = null;

/** 光标离角色包围盒多近（px）算“靠近” */
const NEAR_PX = 72;
const HIDE_DELAY_MS = 1800;

export const ToolBar: React.FC = () => {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const {
    config: { tools: availableTools = [] },
    state: mascotState,
    dispatch: mascotDispatch,
    selectModel,
  } = useMascot();
  const { showMessage: say } = useWaifuMessage();
  const showMessage = useCallback(
    (message: string, timeout: number = 4000) => say(message, timeout, 9),
    [say],
  );

  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [voiceService, setVoiceService] = useState<VoiceService | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'fixed' | 'tts'>('fixed');
  const [prefs, setPrefs] = useState<ToolbarPrefs>(loadToolbarPrefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const [near, setNear] = useState(false);
  const [hoverWin, setHoverWin] = useState(process.env.NODE_ENV === 'development');
  const [focusWithin, setFocusWithin] = useState(false);
  const [place, setPlace] = useState<GutterPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [visible, setVisible] = useState(process.env.NODE_ENV === 'development');

  const updatePrefs = useCallback((patch: Partial<ToolbarPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      saveToolbarPrefs(next);
      return next;
    });
  }, []);

  // 初始化语音服务
  useEffect(() => {
    const initVoiceService = async () => {
      // 等待electronAPI准备就绪
      const waitForElectronAPI = () => {
        return new Promise<void>((resolve) => {
          const checkAPI = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
            if ((window as any).electronAPI) {
              resolve();
            } else {
              setTimeout(checkAPI, 100);
            }
          };
          checkAPI();
        });
      };

      try {
        // 等待electronAPI准备就绪
        await waitForElectronAPI();

        // 延迟一点时间确保所有API都完全加载
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 创建VoiceService实例
        if (!globalVoiceService) {
          globalVoiceService = new VoiceService();

          // 等待VoiceService初始化完成
          await globalVoiceService.waitForInit();
        }

        // 设置到状态中
        setVoiceService(globalVoiceService);

        // 获取VoiceService中的实际设置状态
        const actualSettings = globalVoiceService.getSettings();
        const actualEnabled = actualSettings?.enabled ?? false;
        const actualVoiceMode = actualSettings?.voiceMode ?? 'fixed';

        // 同步UI状态和实际状态
        setVoiceEnabled(actualEnabled);
        setVoiceMode(actualVoiceMode as 'fixed' | 'tts');
      } catch (error) {
        console.error('ToolBar: 初始化语音服务失败:', error);
        // 即使失败也要设置状态，避免组件卡住
        setVoiceService(globalVoiceService);
        setVoiceEnabled(false);
      }
    };

    initVoiceService();
  }, []);

  // 初始化置顶状态
  useEffect(() => {
    const loadAlwaysOnTopState = async () => {
      try {
        const currentState = (await getCache<boolean>('waifu-always-on-top')) === true;
        setAlwaysOnTop(currentState);
      } catch (error) {
        console.error('ToolBar: 加载置顶状态失败:', error);
      }
    };

    loadAlwaysOnTopState();
  }, []);

  // 切换置顶状态
  const toggleAlwaysOnTop = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.setAlwaysOnTop) {
      // 获取当前置顶状态
      const currentState = (await getCache<boolean>('waifu-always-on-top')) === true;

      // 切换置顶状态
      const newState = !currentState;
      await setCache('waifu-always-on-top', newState);
      setAlwaysOnTop(newState);

      // 设置窗口置顶
      electronAPI.setAlwaysOnTop(newState);

      // 显示消息
      showMessage(newState ? '已设置为最前端显示！' : '已取消最前端显示！');
    }
  }, [showMessage]);

  // 拍照功能
  const takeScreenshot = useCallback(() => {
    const canvas = document.querySelector('#mascot-canvas canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      showMessage('找不到画布元素，无法截图');
      return;
    }

    try {
      const imageUrl = canvas.toDataURL();
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = imageUrl;
      link.download = 'mascot-photo.png';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showMessage('照好了，保存在下载目录了');
    } catch (error) {
      console.error('截图失败:', error);
      showMessage('截图失败');
    }
  }, [showMessage]);

  // 显示信息
  // 信息：打开致谢 / Credits（角色、动作与图标的作者和许可）
  const showInfo = useCallback(() => {
    mascotDispatch({ type: 'SET_PANEL', payload: 'credits' });
  }, [mascotDispatch]);

  // 关闭应用
  const quitApp = useCallback(async () => {
    await setCache('waifu-display', Date.now());
    showMessage('再见了，下次见！', 2000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.quit) {
      setTimeout(() => {
        electronAPI.quit();
      }, 2000);
    }
  }, [showMessage]);

  // 切换到下一个内置角色（右键打开角色列表）
  const switchModel = useCallback(() => {
    const next = nextModel(mascotState.modelList, mascotState.modelName);
    if (!next) {
      showMessage('没有可切换的角色');
      return;
    }
    selectModel(next.name);
    showMessage(MESSAGES.modelSwitched(next.displayName));
  }, [mascotState.modelList, mascotState.modelName, selectModel, showMessage]);

  const openModelPicker = useCallback(() => {
    mascotDispatch({ type: 'SET_PICKER_OPEN', payload: true });
  }, [mascotDispatch]);

  // 动作：左键随机播放一个动作，右键打开动作菜单
  const playRandomMotion = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mascot:motion', { detail: { name: 'random' } }));
  }, []);

  const openMotionMenu = useCallback(() => {
    mascotDispatch({ type: 'SET_PANEL', payload: 'motions' });
  }, [mascotDispatch]);

  // Cursor MCP注入
  const injectCursorMCP = useCallback(async () => {
    try {
      showMessage('正在为Cursor注入MCP配置...');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.mcp) {
        // 生成MCP配置并写入Cursor配置文件
        const result = await electronAPI.mcp.setupCursorIntegration();

        if (result.success) {
          showMessage('✅ Cursor MCP配置已成功注入！请重启Cursor IDE以使配置生效');

          // 播放成功提示音
          if (voiceService && voiceEnabled) {
            try {
              // 使用showMessage来播放语音提示
              showMessage('MCP配置注入成功，请重启Cursor IDE');
            } catch (voiceError) {
              console.warn('ToolBar: 语音提示失败:', voiceError);
            }
          }
        } else {
          showMessage(`❌ MCP注入失败: ${result.error || '未知错误'}`);
        }
      } else {
        showMessage('❌ MCP功能不可用，请检查Electron环境');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
    } catch (error: any) {
      console.error('Cursor MCP注入失败:', error);
      showMessage(`❌ MCP注入异常: ${error?.message || '请查看控制台'}`);
    }
  }, [showMessage, voiceService, voiceEnabled]);

  // 切换语音模式（保存到应用配置）
  const toggleVoiceMode = useCallback(async () => {
    if (!voiceService) {
      showMessage('语音服务尚未初始化，请稍后再试...');
      return;
    }

    const newMode = voiceMode === 'fixed' ? 'tts' : 'fixed';

    try {
      // 更新本地状态
      setVoiceMode(newMode);

      // 通过VoiceService保存到Electron配置
      await voiceService.updateSettings({ voiceMode: newMode });

      // 显示切换成功消息
      const modeText = newMode === 'fixed' ? '固定语音' : 'TTS语音';
      showMessage(`已切换到${modeText}模式`);
    } catch (error) {
      console.error('ToolBar: 语音模式切换失败:', error);
      showMessage('语音模式切换失败，请重试');
      // 回滚状态
      setVoiceMode(voiceMode);
    }
  }, [voiceMode, voiceService, showMessage]);

  // 获取工具处理函数
  const getToolHandler = (toolId: string) => {
    switch (toolId) {
      case 'switch-model':
        return switchModel;
      case 'photo':
        return takeScreenshot;
      case 'info':
        return showInfo;
      case 'quit':
        return quitApp;
      case 'toggle-top':
        return toggleAlwaysOnTop;
      case 'voice-settings':
        return () => {
          // 如果VoiceService还没有初始化，显示提示
          if (!voiceService) {
            showMessage('语音服务正在初始化中，请稍后再试...');
            return;
          }

          // 切换语音启用状态
          const newEnabled = !voiceEnabled;

          // 立即更新UI状态
          setVoiceEnabled(newEnabled);

          // 更新VoiceService中的设置
          voiceService.updateSettings({ enabled: newEnabled });

          // 显示消息
          if (newEnabled) {
            showMessage('语音功能已启用！');
          } else {
            showMessage('语音功能已禁用！');
          }
        };
      case 'voice-mode-toggle':
        return toggleVoiceMode;
      case 'tts-config':
        return () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
          const electronAPI = (window as any).electronAPI;
          if (electronAPI && electronAPI.invoke) {
            electronAPI
              .invoke('open-tts-config')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
              .then((result: any) => {
                if (result?.success) {
                  showMessage('TTS配置窗口已打开');
                } else {
                  showMessage(`打开失败: ${result?.error || '未知错误'}`);
                }
              })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
              .catch((error: any) => {
                console.error('打开TTS配置窗口失败:', error);
                showMessage('打开TTS配置窗口失败，请稍后再试');
              });
          } else {
            console.warn('Electron API不可用，无法打开TTS配置窗口');
            showMessage('TTS配置功能需要在Electron环境中运行');
          }
        };
      case 'ai-chat':
        return () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
          const electronAPI = (window as any).electronAPI;
          if (electronAPI && electronAPI.invoke) {
            electronAPI
              .invoke('open-ai-chat')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
              .then((result: any) => {
                if (result?.success) {
                  showMessage('AI对话窗口已打开');
                } else {
                  showMessage(`打开失败: ${result?.error || '未知错误'}`);
                }
              })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
              .catch((error: any) => {
                console.error('打开AI对话窗口失败:', error);
                showMessage('打开AI对话窗口失败，请稍后再试');
              });
          } else {
            console.warn('Electron API不可用，无法打开AI对话窗口');
            showMessage('AI对话功能需要在Electron环境中运行');
          }
        };
      case 'motion':
        return playRandomMotion;
      case 'cursor-mcp':
        return injectCursorMCP;
      default:
        return () => {};
    }
  };

  // ---------- 显示 / 隐藏 ----------
  useEffect(() => {
    const api = window.electronAPI as
      | {
          onWindowMouseEnter?: (cb: () => void) => void;
          onWindowMouseLeave?: (cb: () => void) => void;
          removeWindowMouseListeners?: () => void;
        }
      | undefined;
    if (api?.onWindowMouseEnter) {
      api.onWindowMouseEnter(() => setHoverWin(true));
      api.onWindowMouseLeave?.(() => setHoverWin(false));
      return () => api.removeWindowMouseListeners?.();
    }
    const on = () => setHoverWin(true);
    const off = () => setHoverWin(false);
    document.addEventListener('mouseenter', on);
    document.addEventListener('mouseleave', off);
    return () => {
      document.removeEventListener('mouseenter', on);
      document.removeEventListener('mouseleave', off);
    };
  }, []);

  // 光标靠近角色或工具栏 → 显示（全局光标轮询，点击穿透状态下同样有效）
  useEffect(
    () =>
      layoutStore.subscribe(({ box, cursor }) => {
        if (!cursor || !cursor.inside) {
          setNear(false);
          return;
        }
        const { x, y } = cursor;
        let n = false;
        if (box)
          n =
            x >= box.left - NEAR_PX &&
            x <= box.right + NEAR_PX &&
            y >= box.top - NEAR_PX &&
            y <= box.bottom + NEAR_PX;
        const r = rootRef.current?.getBoundingClientRect();
        if (!n && r && r.width > 0)
          n = x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 24 && y <= r.bottom + 24;
        setNear(n);
      }),
    [],
  );

  const wantVisible = near || hoverWin || focusWithin || menuOpen || showVoiceSettings;
  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (wantVisible) setVisible(true);
    else hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    return () => clearTimeout(hideTimer.current);
  }, [wantVisible]);

  // 菜单打开时 Esc / 点外面关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [menuOpen]);

  // ---------- 布局：角色旁的预留槽位 ----------
  const primary = prefs.compact ? [] : PRIMARY_TOOLS.filter((t) => availableTools.includes(t));
  const secondary = availableTools.filter((t) => !primary.includes(t));
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const compute = () => {
      const bar = barRef.current;
      const bw = bar?.offsetWidth || 44;
      const bh = bar?.offsetHeight || 200;
      const p = placeGutter({
        box: layoutStore.get().box,
        bar: { width: bw, height: bh },
        view: { width: window.innerWidth, height: window.innerHeight },
        screen: {
          winX: window.screenX,
          availLeft: (window.screen as Screen & { availLeft?: number }).availLeft ?? 0,
          availWidth: window.screen.availWidth,
        },
      });
      layoutStore.setGutter({ left: p.x, right: p.x + bw, top: p.y, bottom: p.y + bh });
      setPlace((prev) =>
        prev && prev.side === p.side && Math.abs(prev.x - p.x) < 6 && Math.abs(prev.y - p.y) < 6
          ? prev
          : p,
      );
    };
    compute();
    const off = layoutStore.subscribe(compute);
    const t = setInterval(compute, 700); // 窗口被拖动 / 物理移动后检查是否贴边
    window.addEventListener('resize', compute);
    return () => {
      off();
      clearInterval(t);
      window.removeEventListener('resize', compute);
    };
  }, [primary.length]);

  useEffect(() => {
    const el = rootRef.current;
    if (el) {
      el.dataset.side = place?.side ?? 'right';
      document.documentElement.dataset.toolbarSide = place?.side ?? 'right';
      document.documentElement.dataset.toolbarVisible = visible ? '1' : '0';
    }
  }, [place, visible]);

  // 菜单纵向位置：尽量与工具栏顶部对齐，但整体留在窗口内（过高时内部滚动）
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState(0);
  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const h = Math.min(menuRef.current.scrollHeight, window.innerHeight - 16);
    const y0 = place?.y ?? 0;
    const want = Math.max(8, Math.min(window.innerHeight - h - 8, y0));
    setMenuTop(want - y0);
  }, [menuOpen, place, prefs.compact]);

  // ---------- 按钮 ----------
  const toolIcon = (toolId: string): LucideIcon => {
    switch (toolId) {
      case 'ai-chat':
        return Bot;
      case 'switch-model':
        return UserRound;
      case 'motion':
        return Hand;
      case 'voice-settings':
        return voiceEnabled ? Volume2 : VolumeX;
      case 'voice-mode-toggle':
        return voiceMode === 'fixed' ? Mic : AudioLines;
      case 'tts-config':
        return Settings2;
      case 'cursor-mcp':
        return Layers;
      case 'toggle-top':
        return alwaysOnTop ? Pin : PinOff;
      case 'info':
        return Info;
      case 'quit':
        return X;
      default:
        return Ellipsis;
    }
  };

  const toolLabel = (toolId: string): string => {
    switch (toolId) {
      case 'switch-model':
        return '切换角色（右键：角色列表）';
      case 'photo':
        return '截图保存';
      case 'info':
        return '致谢 / Credits';
      case 'quit':
        return '关闭应用';
      case 'toggle-top':
        return alwaysOnTop ? '取消窗口置顶' : '窗口置顶';
      case 'voice-settings':
        return voiceEnabled ? '语音：开（右键：语音设置）' : '语音：关（右键：语音设置）';
      case 'voice-mode-toggle':
        return voiceMode === 'fixed' ? '语音模式：固定语音' : '语音模式：TTS';
      case 'tts-config':
        return 'TTS 语音配置';
      case 'ai-chat':
        return 'AI 对话';
      case 'motion':
        return '做个动作（右键：动作列表）';
      case 'cursor-mcp':
        return '为 Cursor 注入 MCP 配置';
      default:
        return toolId;
    }
  };

  const pressed = (toolId: string): boolean | undefined => {
    if (toolId === 'toggle-top') return alwaysOnTop;
    if (toolId === 'voice-settings') return voiceEnabled;
    return undefined;
  };

  const onContext = (toolId: string) =>
    toolId === 'voice-settings'
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          setShowVoiceSettings(true);
        }
      : toolId === 'switch-model'
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            openModelPicker();
          }
        : toolId === 'motion'
          ? (e: React.MouseEvent) => {
              e.preventDefault();
              openMotionMenu();
            }
          : undefined;

  const tipSide = place?.side === 'left' ? 'right' : 'left';

  const iconButton = (toolId: string) => {
    const Icon = toolIcon(toolId);
    const label = toolLabel(toolId);
    const handler = getToolHandler(toolId);
    return (
      <Tooltip key={toolId} content={label} placement={tipSide}>
        <button
          type="button"
          className={`${styles.btn} ${toolId === 'quit' ? styles.danger : ''}`}
          id={`waifu-tool-${toolId}`}
          data-testid={`tool-${toolId}`}
          aria-label={label}
          aria-pressed={pressed(toolId)}
          onClick={() => handler()}
          onContextMenu={onContext(toolId)}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden />
        </button>
      </Tooltip>
    );
  };

  const menuItem = (toolId: string) => {
    const Icon = toolIcon(toolId);
    const label = toolLabel(toolId);
    const handler = getToolHandler(toolId);
    return (
      <button
        key={toolId}
        type="button"
        role="menuitem"
        className={`${styles.menuItem} ${toolId === 'quit' ? styles.danger : ''}`}
        id={`waifu-tool-${toolId}`}
        data-testid={`tool-${toolId}`}
        aria-pressed={pressed(toolId)}
        onClick={() => {
          setMenuOpen(false);
          handler();
        }}
        onContextMenu={onContext(toolId)}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden />
        <span>{label.replace(/（右键：.*）$/, '')}</span>
      </button>
    );
  };

  const style: React.CSSProperties = place
    ? { left: place.x, top: place.y }
    : { right: 8, top: '30%' };

  return (
    <>
      <div
        ref={rootRef}
        className={`${styles.root} ${visible ? styles.shown : styles.hidden}`}
        data-palette={prefs.palette}
        data-testid="mascot-toolbar"
        data-mascot-ui={visible ? '' : undefined}
        style={style}
        onFocus={(e) => {
          // 只有键盘焦点（:focus-visible）才让工具栏保持显示；鼠标点击留下的焦点不算
          setFocusWithin((e.target as HTMLElement).matches(':focus-visible'));
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false);
        }}
      >
        <div
          ref={barRef}
          className={styles.bar}
          role="toolbar"
          aria-label="看板娘工具栏"
          aria-orientation="vertical"
        >
          {primary.map(iconButton)}
          {primary.length > 0 && secondary.length > 0 && <div className={styles.sep} aria-hidden />}
          <Tooltip content={menuOpen ? '收起' : '更多'} placement={tipSide}>
            <button
              type="button"
              className={styles.btn}
              data-testid="tool-more"
              aria-label="更多"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Ellipsis size={17} strokeWidth={1.75} aria-hidden />
            </button>
          </Tooltip>
        </div>

        {menuOpen && (
          <div
            className={styles.menu}
            role="menu"
            aria-label="更多工具"
            data-testid="toolbar-menu"
            ref={menuRef}
            style={{ top: menuTop }}
          >
            {secondary.map(menuItem)}
            <div className={styles.sep} aria-hidden />
            <div className={styles.menuRow}>
              <span>收起为单个按钮</span>
              <Switch
                checked={prefs.compact}
                onChange={(v: boolean) => updatePrefs({ compact: v })}
                aria-label="收起为单个按钮"
                data-testid="toolbar-compact"
              />
            </div>
            <div className={styles.menuRow}>
              <span>配色</span>
              <div className={styles.swatches} role="radiogroup" aria-label="工具栏配色">
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={prefs.palette === p.id}
                    aria-label={p.label}
                    title={p.label}
                    data-testid={`toolbar-palette-${p.id}`}
                    className={styles.swatch}
                    style={{ background: p.swatch }}
                    onClick={() => updatePrefs({ palette: p.id })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {voiceService && (
        <VoiceSettings
          voiceService={voiceService}
          isVisible={showVoiceSettings}
          onClose={() => setShowVoiceSettings(false)}
          onSettingsChange={() =>
            setVoiceEnabled(globalVoiceService?.getSettings()?.enabled ?? false)
          }
        />
      )}
    </>
  );
};
