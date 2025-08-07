import React, { useEffect, useState } from 'react';
import Live2dWidget from './components/Live2dWidget';
import VirtualCharacter3D from './components/VirtualCharacter3D';
import CustomImageManager from './components/CustomImageManager';
import { ToolBar } from './components/ToolBar';
import { Live2DProvider } from './contexts/Live2DContext';
import type { ModelConfig } from './types/live2d';
import type { RenderMode, DisplayModeConfig, CustomImageInfo } from '@ig-live/types';

const App: React.FC = () => {
  const [isElectron, setIsElectron] = useState(false);
  const [enable3D, setEnable3D] = useState(false);
  const [currentMode, setCurrentMode] = useState<RenderMode>('live2d');
  const [customImageInfo, setCustomImageInfo] = useState<CustomImageInfo | null>(null);

  // 检测Electron环境和3D支持
  useEffect(() => {
    // 检查window.electronAPI是否存在，确定是否在Electron环境中
    setIsElectron(!!window.electronAPI);

    // 检查WebGL支持以决定是否启用3D功能
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (gl) {
      setEnable3D(true);
      console.log('App: 3D支持已启用');
    } else {
      console.warn('App: WebGL不支持，仅启用Live2D模式');
    }
  }, []);

  // 恢复保存的显示模式
  useEffect(() => {
    const restoreDisplayMode = async () => {
      if (!window.electronAPI) return;

      try {
        const config = await window.electronAPI.getDisplayModeConfig();
        console.log('App: 恢复显示模式配置', config);

        if (config && config.currentMode) {
          setCurrentMode(config.currentMode);

          // 如果是自定义图片模式，加载图片信息
          if (config.currentMode === 'custom-image' && config.customImage) {
            setCustomImageInfo(config.customImage);
          }
        }
      } catch (error) {
        console.error('App: 恢复显示模式失败', error);
      }
    };

    restoreDisplayMode();
  }, []);

  // Live2D Widget配置
  const live2dConfig: ModelConfig = {
    waifuPath: '/assets/waifu-tips.json', // 使用绝对路径
    cubism2Path: '/assets/live2d.min.js', // 使用绝对路径
    tools: [
      'switch-model',
      'ai-chat',
      'info',
      'voice-settings',
      'voice-mode-toggle', // 添加语音模式切换按钮
      'tts-config', // 添加TTS配置按钮
      'mode-switch', // 模式切换工具（Live2D、3D、自定义图片）
      'cursor-mcp', // 添加Cursor MCP注入工具
      'toggle-top',
      'quit'
    ],
    logLevel: 'warn',
    drag: true,
  };

  // 处理模式切换
  const handleModeChange = (mode: RenderMode) => {
    console.log(`App: 切换到${mode}模式`);
    setCurrentMode(mode);

    // 保存到配置
    if (window.electronAPI) {
      window.electronAPI.setCurrentMode(mode).catch(error => {
        console.error('App: 保存模式配置失败', error);
      });
    }
  };

  // 处理自定义图片信息变化
  const handleCustomImageChange = (imageInfo: CustomImageInfo | null) => {
    console.log('App: 自定义图片信息变化', imageInfo);
    setCustomImageInfo(imageInfo);

    // 保存到配置
    if (window.electronAPI) {
      const config: DisplayModeConfig = {
        currentMode: currentMode,
        customImage: imageInfo || undefined
      };

      window.electronAPI.saveDisplayModeConfig(config).catch(error => {
        console.error('App: 保存图片配置失败', error);
      });
    }
  };

  // 监听工具栏的模式切换事件
  useEffect(() => {
    const handleModeSwitch = (event: any) => {
      const { mode } = event.detail;
      if (['live2d', '3d', 'custom-image'].includes(mode)) {
        handleModeChange(mode);

        // 通知ToolBar组件模式已切换完成
        setTimeout(() => {
          const completeEvent = new CustomEvent('mode-switch-complete', {
            detail: { mode }
          });
          window.dispatchEvent(completeEvent);
        }, 100);
      }
    };

    window.addEventListener('mode-switch', handleModeSwitch);
    return () => {
      window.removeEventListener('mode-switch', handleModeSwitch);
    };
  }, []); // 移除currentMode依赖，避免重复注册

  return (
    <div className="app" style={{ width: '100%', height: '100vh', position: 'relative' }}>

      {/* 角色渲染 */}
      {currentMode === 'live2d' && (
        <div style={{
          width: '100%',
          height: '100%',
          position: 'relative'
          /* 移除transform，在Live2D内部处理定位 */
        }}>
          <Live2dWidget config={live2dConfig} />
        </div>
      )}

      {currentMode === '3d' && enable3D && (
        <Live2DProvider config={live2dConfig}>
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative'
            /* 移除transform，使用内部定位 */
          }}>
            {/* 3D角色 */}
            <VirtualCharacter3D
              enableMCPIntegration={true}
              enableVoiceSync={true}
              enableControls={process.env.NODE_ENV === 'development'}
              transparent={true}
              onReady={() => console.log('App: 3D角色就绪')}
              onError={(error) => console.error('App: 3D角色错误:', error)}
              style={{
                transform: 'translateX(-40px)' /* 3D角色也稍微左移以配合布局 */
              }}
            />
            {/* 独立的工具栏，在3D模式下也显示 */}
            <ToolBar />
          </div>
        </Live2DProvider>
      )}

      {currentMode === 'custom-image' && (
        <Live2DProvider config={live2dConfig}>
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative'
          }}>
            {/* 自定义图片管理器 */}
            <CustomImageManager
              onModeChange={handleModeChange}
              onImageChange={handleCustomImageChange}
            />
            {/* 独立的工具栏，在自定义图片模式下也显示 */}
            <ToolBar />
          </div>
        </Live2DProvider>
      )}
    </div>
  );
};

export default App; 