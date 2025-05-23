import React, { useCallback, useEffect } from 'react';
import { useLive2D } from '@/contexts/Live2DContext';
import { useLive2DModel } from '@/hooks/useLive2DModel';
import { useWaifuMessage } from '@/hooks/useWaifuMessage';
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

export const ToolBar: React.FC = () => {
  const { state, dispatch, config } = useLive2D();
  const { loadRandomTexture, loadNextModel } = useLive2DModel();
  const { showMessage } = useWaifuMessage();

  // 配置可用的工具
  const availableTools = config.tools || [
    'switch-model',
    'switch-texture',
    'photo',
    'info',
    'quit',
    'toggle-top'
  ];

  // 加载一言API
  const loadHitokoto = useCallback(async () => {
    try {
      const response = await fetch('https://v1.hitokoto.cn');
      const result = await response.json();
      const template = '这句一言来自 <span>{0}</span>，是 {1} 在 hitokoto.cn 投稿的。';

      // 显示一言内容
      showMessage(result.hitokoto, 6000, 9);

      // 6秒后显示一言来源
      setTimeout(() => {
        const text = template
          .replace('{0}', result.from)
          .replace('{1}', result.creator || '无名氏');
        showMessage(text, 4000, 9);
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
      const alwaysOnTop = await getCache<boolean>('waifu-always-on-top') === true;

      // 切换置顶状态
      const newState = !alwaysOnTop;
      await setCache('waifu-always-on-top', newState);

      // 设置窗口置顶
      electronAPI.setAlwaysOnTop(newState);

      // 更新状态并显示消息
      dispatch({ type: 'TOGGLE_ALWAYS_ON_TOP' });
      showMessage(
        newState ? '已设置为最前端显示！' : '已取消最前端显示！'
      );
    }
  }, [dispatch, showMessage]);

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
    showMessage('再见了，下次见！', 2000, 11);

    const waifu = document.getElementById('waifu');
    if (waifu) {
      waifu.style.bottom = '-500px';
      setTimeout(() => {
        if (waifu) waifu.style.display = 'none';
      }, 3000);
    }
  }, [showMessage]);

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
        return () => loadNextModel();
      case 'switch-texture':
        return () => loadRandomTexture();
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
        return state.alwaysOnTop ? '取消置顶' : '置顶';
      default:
        return '';
    }
  };

  return (
    <div className="waifu-tool">
      {availableTools.map((tool) => (
        <span key={tool} onClick={getToolHandler(tool)} title={getToolTip(tool)}>
          <div dangerouslySetInnerHTML={{ __html: getToolIcon(tool) }} />
        </span>
      ))}
    </div>
  );
}; 