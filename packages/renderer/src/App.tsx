import React, { useEffect, useState } from 'react';
import Live2dWidget from './components/Live2dWidget';
import VirtualCharacter3D from './components/VirtualCharacter3D';
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
      'toggle-top',
      'quit'
    ],
    logLevel: 'warn',
    drag: true,
  };

  // 处理模式切换
  const handleModeChange = (mode: 'live2d' | '3d') => {
    console.log(`App: 切换到${mode}模式`);
  };

  return (
    <div className="app" style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* 模式切换按钮 */}
      {enable3D && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          gap: '8px'
        }}>
          <button
            onClick={() => setCurrentMode('live2d')}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              background: currentMode === 'live2d' ? '#007AFF' : '#666',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Live2D
          </button>
          <button
            onClick={() => setCurrentMode('3d')}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              background: currentMode === '3d' ? '#007AFF' : '#666',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            3D
          </button>
        </div>
      )}

      {/* 角色渲染 */}
      {currentMode === 'live2d' && (
        <Live2dWidget config={live2dConfig} />
      )}

      {currentMode === '3d' && enable3D && (
        <div style={{ width: '100%', height: '100%' }}>
          <VirtualCharacter3D
            enableMCPIntegration={true}
            enableVoiceSync={true}
            enableControls={process.env.NODE_ENV === 'development'}
            transparent={true}
            onReady={() => console.log('App: 3D角色就绪')}
            onError={(error) => console.error('App: 3D角色错误:', error)}
          />
        </div>
      )}
    </div>
  );
};

export default App; 