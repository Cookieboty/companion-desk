import type { CustomImageInfo, DisplayModeConfig, RenderMode } from '@ig-live/types';
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';

import { MascotHost } from './components/Mascot';
import { ToolBar } from './components/ToolBar';
import { normalizeRenderMode } from './config/renderMode';
import { MascotProvider, type MascotConfig } from './contexts/MascotContext';

const CustomImageManager = lazy(() => import('./components/CustomImageManager'));

const MASCOT_CONFIG: MascotConfig = {
  tools: [
    'switch-model',
    'ai-chat',
    'info',
    'voice-settings',
    'voice-mode-toggle',
    'tts-config',
    'mode-switch',
    'cursor-mcp',
    'toggle-top',
    'quit',
  ],
  drag: true,
};

const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<RenderMode>('3d');
  const [, setCustomImageInfo] = useState<CustomImageInfo | null>(null);

  // 恢复保存的显示模式（旧版本保存的 'live2d' 会被归一化为 '3d'）
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI
      .getDisplayModeConfig()
      .then((config) => {
        if (!config?.currentMode) return;
        const mode = normalizeRenderMode(config.currentMode);
        setCurrentMode(mode);
        if (mode === 'custom-image' && config.customImage) setCustomImageInfo(config.customImage);
      })
      .catch((error) => console.error('App: 恢复显示模式失败', error));
  }, []);

  const handleModeChange = useCallback((mode: RenderMode) => {
    setCurrentMode(mode);
    window.electronAPI?.setCurrentMode(mode).catch((error) => {
      console.error('App: 保存模式配置失败', error);
    });
  }, []);

  const handleCustomImageChange = (imageInfo: CustomImageInfo | null) => {
    setCustomImageInfo(imageInfo);
    if (window.electronAPI) {
      const config: DisplayModeConfig = { currentMode, customImage: imageInfo || undefined };
      window.electronAPI.saveDisplayModeConfig(config).catch((error) => {
        console.error('App: 保存图片配置失败', error);
      });
    }
  };

  // 监听工具栏的模式切换事件
  useEffect(() => {
    const onSwitch = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: string }>).detail?.mode;
      if (mode !== '3d' && mode !== 'custom-image') return;
      handleModeChange(mode);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mode-switch-complete', { detail: { mode } }));
      }, 100);
    };
    window.addEventListener('mode-switch', onSwitch);
    return () => window.removeEventListener('mode-switch', onSwitch);
  }, [handleModeChange]);

  return (
    <div className="app" style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <MascotProvider config={MASCOT_CONFIG}>
        {currentMode === '3d' ? (
          <MascotHost />
        ) : (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Suspense fallback={null}>
              <CustomImageManager
                onModeChange={handleModeChange}
                onImageChange={handleCustomImageChange}
              />
            </Suspense>
            <ToolBar />
          </div>
        )}
      </MascotProvider>
    </div>
  );
};

export default App;
