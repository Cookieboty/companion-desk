import React, { useCallback, useEffect, useState } from 'react';
import {
  fa_comment,
  fa_paper_plane,
  fa_user_circle,
  fa_street_view,
  fa_camera_retro,
  fa_info_circle,
  fa_xmark,
  fa_thumbtack
} from '@/utils/icons';
import { getCache, setCache } from '@/utils/cache';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import styles from './style.module.css';

export const ToolBar: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false); // 默认隐藏
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const { loadNextModel, loadRandomTexture } = useLive2DModel();

  // 配置可用的工具
  const availableTools = [
    'switch-model',
    'photo',
    'info',
    'quit',
    'toggle-top'
  ];

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
  }, []);

  // Focus事件处理函数
  const handleButtonFocus = useCallback((event: React.FocusEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    button.blur();
    button.style.outline = 'none';
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
      default:
        return '';
    }
  };

  console.log('ToolBar: 渲染组件，isVisible =', isVisible);

  // 获取按钮的CSS类名
  const getButtonClassName = (toolId: string) => {
    const baseClass = styles.button;
    switch (toolId) {
      case 'quit':
        return `${baseClass} ${styles.closeButton}`;
      case 'toggle-top':
        return `${baseClass} ${styles.topButton}`;
      case 'photo':
        return `${baseClass} ${styles.photoButton}`;
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

  return (
    <div className={`${styles.toolbar} ${isVisible ? styles.visible : styles.hidden}`}>
      {availableTools.map((tool) => (
        <button
          key={tool}
          className={getButtonClassName(tool)}
          onClick={createButtonHandler(getToolHandler(tool))}
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
  );
}; 