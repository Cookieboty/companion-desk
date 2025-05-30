import React, { useCallback, useEffect, useState } from 'react';
import {
  fa_comment,
  fa_paper_plane,
  fa_user_circle,
  fa_street_view,
  fa_camera_retro,
  fa_info_circle,
  fa_xmark,
  fa_thumbtack,
  fa_volume_up,
  fa_volume_off
} from '@/utils/icons';
import { getCache, setCache } from '@/utils/cache';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import styles from './style.module.css';
import { useLive2D } from '@/contexts/Live2DContext';
import { VoiceSettings } from '../VoiceSettings';
import { VoiceService } from '../../services/VoiceService';

// 创建全局语音服务实例
let globalVoiceService: VoiceService | null = null;

export const ToolBar: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false); // 默认隐藏
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const { loadNextModel, loadRandomTexture, } = useLive2DModel();
  const { config: { tools: availableTools = [] } } = useLive2D();
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [voiceService, setVoiceService] = useState<VoiceService | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false); // 语音功能状态，默认禁用

  // 初始化语音服务
  useEffect(() => {

    const initVoiceService = async () => {
      // 等待electronAPI准备就绪
      const waitForElectronAPI = () => {
        return new Promise<void>((resolve) => {
          const checkAPI = () => {
            if ((window as any).electronAPI) {
              console.log('ToolBar: electronAPI已准备就绪');
              resolve();
            } else {
              console.log('ToolBar: 等待electronAPI准备就绪...');
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
        await new Promise(resolve => setTimeout(resolve, 500));

        // 创建VoiceService实例
        if (!globalVoiceService) {
          console.log('ToolBar: 创建新的VoiceService实例');
          globalVoiceService = new VoiceService();
          console.log('ToolBar: VoiceService实例创建成功');

          // 等待VoiceService初始化完成
          console.log('ToolBar: 等待VoiceService初始化完成');
          await globalVoiceService.waitForInit();
          console.log('ToolBar: VoiceService初始化完成，状态:', globalVoiceService.isReady());
        }

        // 设置到状态中
        setVoiceService(globalVoiceService);
        console.log('ToolBar: VoiceService设置完成');

        // 获取VoiceService中的实际设置状态
        const actualSettings = globalVoiceService.getSettings();
        const actualEnabled = actualSettings?.enabled ?? false;

        // 同步UI状态和实际状态
        setVoiceEnabled(actualEnabled);
        console.log('ToolBar: 语音状态同步完成，实际状态:', actualEnabled);

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
        const currentState = await getCache<boolean>('waifu-always-on-top') === true;
        setAlwaysOnTop(currentState);
        console.log('ToolBar: 置顶状态加载完成:', currentState);
      } catch (error) {
        console.error('ToolBar: 加载置顶状态失败:', error);
      }
    };

    loadAlwaysOnTopState();
  }, []);

  // 强制清除按钮focus状态的函数
  const clearButtonFocus = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    // 立即移除focus
    button.blur();
    // 强制重置样式
    button.style.outline = 'none';
    button.style.boxShadow = '';
    button.style.transform = '';
    button.style.background = '';

    // 延迟一帧后再次确保清除
    requestAnimationFrame(() => {
      button.blur();
      button.style.outline = 'none';
    });

    // 同时清除页面上所有Canvas的focus状态
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      if (canvas instanceof HTMLCanvasElement) {
        canvas.blur();
        canvas.style.outline = 'none';
        canvas.style.outlineWidth = '0';
        canvas.style.outlineStyle = 'none';
        canvas.style.outlineColor = 'transparent';
      }
    });
  }, []);

  // Focus事件处理函数
  const handleButtonFocus = useCallback((event: React.FocusEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    button.blur();
    button.style.outline = 'none';

    // 同时清除页面上所有Canvas的focus状态
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      if (canvas instanceof HTMLCanvasElement) {
        canvas.blur();
        canvas.style.outline = 'none';
      }
    });
  }, []);

  // 鼠标事件监听
  useEffect(() => {
    console.log('ToolBar: 初始化');
    const electronAPI = (window as any).electronAPI;

    if (electronAPI) {
      // 定义事件处理函数
      const handleWindowMouseEnter = () => {
        setIsVisible(true);
      };

      const handleWindowMouseLeave = () => {
        setIsVisible(false);
      };

      // 注册事件监听器
      electronAPI.onWindowMouseEnter(handleWindowMouseEnter);
      electronAPI.onWindowMouseLeave(handleWindowMouseLeave);

      // 清理函数
      return () => {
        console.log('ToolBar: 清理Electron事件监听器');
        electronAPI.removeWindowMouseListeners();
      };
    } else {
      // 简单的鼠标事件处理
      const handleMouseEnter = () => {
        setIsVisible(true);
      };

      const handleMouseLeave = () => {
        setIsVisible(false);
      };

      // 监听整个文档的鼠标事件
      document.addEventListener('mouseenter', handleMouseEnter);
      document.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        document.removeEventListener('mouseenter', handleMouseEnter);
        document.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, []);

  // 监听isVisible状态变化
  useEffect(() => {
    console.log('ToolBar: 可见性状态变化:', isVisible);
  }, [isVisible]);

  // 显示消息的简单实现
  const showMessage = useCallback((message: string, timeout: number = 4000) => {
    // 通过ID获取消息气泡元素（MessageBubble组件已经设置了ID）
    let messageElement = document.getElementById('waifu-tips-independent') as HTMLElement;
    if (!messageElement) {
      // 如果找不到MessageBubble组件，创建一个临时的消息元素
      messageElement = document.createElement('div');
      messageElement.id = 'waifu-tips-temp';
      messageElement.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        width: 200px;
        min-height: 70px;
        margin-left: -100px;
        padding: 8px 12px;
        border: 1px solid rgba(224, 186, 140, 0.62);
        border-radius: 12px;
        background-color: rgba(236, 217, 188, 0.9);
        box-shadow: 0 3px 15px 2px rgba(191, 158, 118, 0.3);
        font-size: 14px;
        line-height: 24px;
        word-break: break-all;
        text-overflow: ellipsis;
        overflow: hidden;
        color: #8a6e2f;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        z-index: 10000;
        pointer-events: none;
      `;
      document.body.appendChild(messageElement);
    }

    messageElement.innerHTML = message;
    messageElement.style.opacity = '1';

    // 自动隐藏
    setTimeout(() => {
      messageElement.style.opacity = '0';
    }, timeout);
  }, []);

  // 加载一言API
  const loadHitokoto = useCallback(async () => {
    try {
      const response = await fetch('https://v1.hitokoto.cn');
      const result = await response.json();
      const template = '这句一言来自 <span>{0}</span>，是 {1} 在 hitokoto.cn 投稿的。';

      // 显示一言内容
      showMessage(result.hitokoto, 6000);

      // 6秒后显示一言来源
      setTimeout(() => {
        const text = template
          .replace('{0}', result.from)
          .replace('{1}', result.creator || '无名氏');
        showMessage(text, 4000);
      }, 6000);
    } catch (error) {
      console.error('加载一言API失败:', error);
      showMessage('加载一言失败，请检查网络连接');
    }
  }, [showMessage]);

  // 切换置顶状态
  const toggleAlwaysOnTop = useCallback(async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.setAlwaysOnTop) {
      // 获取当前置顶状态
      const currentState = await getCache<boolean>('waifu-always-on-top') === true;

      // 切换置顶状态
      const newState = !currentState;
      await setCache('waifu-always-on-top', newState);
      setAlwaysOnTop(newState);

      // 设置窗口置顶
      electronAPI.setAlwaysOnTop(newState);

      // 显示消息
      showMessage(
        newState ? '已设置为最前端显示！' : '已取消最前端显示！'
      );
    }
  }, [showMessage]);

  // 拍照功能
  const takeScreenshot = useCallback(() => {
    const canvas = document.getElementById('live2d') as HTMLCanvasElement;
    if (!canvas) {
      showMessage('找不到画布元素，无法截图');
      return;
    }

    try {
      const imageUrl = canvas.toDataURL();
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = imageUrl;
      link.download = 'live2d-photo.png';

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
  const showInfo = useCallback(() => {
    window.open('https://github.com/Cookieboty/ai-live2d-client', '_blank');
  }, []);

  // 关闭应用
  const quitApp = useCallback(async () => {
    await setCache('waifu-display', Date.now());
    showMessage('再见了，下次见！', 2000);

    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.quit) {
      setTimeout(() => {
        electronAPI.quit();
      }, 2000);
    }
  }, [showMessage]);

  // 切换模型 - 恢复完整功能
  const switchModel = useCallback(async () => {
    try {
      await loadNextModel();
      showMessage('正在切换模型...');
    } catch (error) {
      console.error('切换模型失败:', error);
      showMessage('切换模型失败');
    }
  }, [loadNextModel, showMessage]);

  // 切换纹理 - 恢复完整功能
  const switchTexture = useCallback(async () => {
    try {
      await loadRandomTexture();
      showMessage('正在切换服装...');
    } catch (error) {
      console.error('切换服装失败:', error);
      showMessage('切换服装失败');
    }
  }, [loadRandomTexture, showMessage]);

  // 获取工具图标
  const getToolIcon = (toolId: string): string => {
    switch (toolId) {
      case 'hitokoto':
        return fa_comment;
      case 'asteroids':
        return fa_paper_plane;
      case 'switch-model':
        return fa_user_circle;
      case 'switch-texture':
        return fa_street_view;
      case 'photo':
        return fa_camera_retro;
      case 'info':
        return fa_info_circle;
      case 'quit':
        return fa_xmark;
      case 'toggle-top':
        return fa_thumbtack;
      case 'voice-settings':
        return voiceEnabled ? fa_volume_up : fa_volume_off;
      default:
        return '';
    }
  };

  // 获取工具处理函数
  const getToolHandler = (toolId: string) => {
    switch (toolId) {
      case 'switch-model':
        return switchModel;
      case 'switch-texture':
        return switchTexture;
      case 'hitokoto':
        return loadHitokoto;
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
          console.log('ToolBar: 语音设置按钮被点击');

          // 如果VoiceService还没有初始化，显示提示
          if (!voiceService) {
            showMessage('语音服务正在初始化中，请稍后再试...');
            return;
          }

          // 切换语音启用状态
          const newEnabled = !voiceEnabled;
          console.log('ToolBar: 切换语音状态从', voiceEnabled, '到', newEnabled);

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

          console.log('ToolBar: 语音状态切换完成:', newEnabled);
        };
      case 'asteroids':
        return () => {
          if ((window as any).Asteroids) {
            if (!(window as any).ASTEROIDSPLAYERS) (window as any).ASTEROIDSPLAYERS = [];
            (window as any).ASTEROIDSPLAYERS.push(new (window as any).Asteroids());
          } else {
            const script = document.createElement('script');
            script.src = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/asteroids/asteroids.js';
            document.head.appendChild(script);
          }
        };
      default:
        return () => { };
    }
  };

  // 获取工具提示文本
  const getToolTip = (toolId: string) => {
    switch (toolId) {
      case 'hitokoto':
        return '一言';
      case 'asteroids':
        return '小游戏';
      case 'switch-model':
        return '切换模型';
      case 'switch-texture':
        return '切换衣服';
      case 'photo':
        return '拍照';
      case 'info':
        return '关于';
      case 'quit':
        return '关闭';
      case 'toggle-top':
        return alwaysOnTop ? '取消置顶' : '置顶';
      case 'voice-settings':
        return voiceEnabled ? '语音功能 (已启用) - 左键切换，右键设置' : '语音功能 (已禁用) - 左键切换，右键设置';
      default:
        return '';
    }
  };

  console.log('ToolBar: 渲染组件，isVisible =', isVisible);
  console.log('ToolBar: 可用工具列表:', availableTools);
  console.log('ToolBar: 语音服务状态:', !!voiceService, voiceEnabled);
  console.log('ToolBar: 语音设置弹窗状态:', showVoiceSettings);

  // 获取按钮的CSS类名
  const getButtonClassName = (toolId: string) => {
    const baseClass = styles.button;
    switch (toolId) {
      case 'quit':
        return `${baseClass} ${styles.closeButton}`;
      case 'toggle-top':
        // 根据置顶状态显示不同样式
        return `${baseClass} ${alwaysOnTop ? styles.topButtonActive : styles.topButton}`;
      case 'photo':
        return `${baseClass} ${styles.photoButton}`;
      case 'voice-settings':
        // 根据语音启用状态显示不同样式
        return `${baseClass} ${voiceEnabled ? styles.voiceButton : styles.voiceButtonDisabled}`;
      default:
        return baseClass;
    }
  };

  // 创建按钮点击处理函数
  const createButtonHandler = useCallback((handler: () => void) => {
    return (event: React.MouseEvent<HTMLButtonElement>) => {
      // 先清除focus状态
      clearButtonFocus(event);
      // 然后执行原始处理函数
      handler();
    };
  }, [clearButtonFocus]);

  // 语音设置按钮点击处理
  const handleVoiceSettingsClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    console.log('ToolBar: 语音设置按钮被点击');
    // 手动清除focus状态
    const button = event.currentTarget;
    button.blur();
    button.style.outline = 'none';

    console.log('ToolBar: 设置showVoiceSettings为true');
    setShowVoiceSettings(true);
  }, []);

  // 关闭语音设置
  const handleCloseVoiceSettings = useCallback(() => {
    setShowVoiceSettings(false);
  }, []);

  // 语音设置变化回调
  const handleVoiceSettingsChange = useCallback(() => {
    // 立即更新语音状态
    const settings = globalVoiceService?.getSettings();
    setVoiceEnabled(settings?.enabled ?? false);
  }, []);

  return (
    <>
      {
        isVisible && (
          <div className={`${styles.toolbar} ${isVisible ? styles.visible : styles.hidden}`}>
            {availableTools.map((tool) => (
              <button
                key={tool}
                className={getButtonClassName(tool)}
                onClick={createButtonHandler(getToolHandler(tool))}
                onContextMenu={tool === 'voice-settings' ? (e) => {
                  e.preventDefault();
                  console.log('ToolBar: 语音按钮右键点击，打开设置');
                  setShowVoiceSettings(true);
                } : undefined}
                onMouseDown={clearButtonFocus}
                onMouseUp={clearButtonFocus}
                onFocus={handleButtonFocus}
                title={getToolTip(tool)}
              >
                <div
                  className={styles.icon}
                  dangerouslySetInnerHTML={{ __html: getToolIcon(tool) }}
                />
              </button>
            ))}
          </div>
        )
      }

      {/* 语音设置弹窗 */}
      {voiceService && (
        <VoiceSettings
          voiceService={voiceService}
          isVisible={showVoiceSettings}
          onClose={handleCloseVoiceSettings}
          onSettingsChange={handleVoiceSettingsChange}
        />
      )}
    </>
  );
}; 