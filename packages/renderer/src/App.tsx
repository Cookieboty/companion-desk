import React, { useEffect, useState } from 'react';
import Live2dWidget from './components/Live2dWidget';
import VirtualCharacter3D from './components/VirtualCharacter3D';
import { ToolBar } from './components/ToolBar';
import { Live2DProvider } from './contexts/Live2DContext';
import type { ModelConfig } from './types/live2d';

const App: React.FC = () => {
  const [isElectron, setIsElectron] = useState(false);
  const [enable3D, setEnable3D] = useState(false);
  const [currentMode, setCurrentMode] = useState<'live2d' | '3d'>('live2d');

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

  // Live2D Widget配置
  const live2dConfig: ModelConfig = {
    waifuPath: '/assets/waifu-tips.json', // 使用绝对路径
    cubism2Path: '/assets/live2d.min.js', // 使用绝对路径
    tools: [
      'switch-model',
      'ai-chat',
      'info',
      'voice-settings',
      ...(enable3D ? ['3d-mode'] : []), // 如果支持3D，添加3D模式切换工具
      'cursor-mcp', // 添加Cursor MCP注入工具
      'toggle-top',
      'quit'
    ],
    logLevel: 'warn',
    drag: true,
  };

  // 处理模式切换
  const handleModeChange = (mode: 'live2d' | '3d') => {
    console.log(`App: 切换到${mode}模式`);
    setCurrentMode(mode);
  };

  // 监听工具栏的模式切换事件
  useEffect(() => {
    const handleModeSwitch = (event: any) => {
      const { mode } = event.detail;
      setCurrentMode(mode);
    };

    window.addEventListener('mode-switch', handleModeSwitch);
    return () => {
      window.removeEventListener('mode-switch', handleModeSwitch);
    };
  }, []);

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
    </div>
  );
};

export default App; 