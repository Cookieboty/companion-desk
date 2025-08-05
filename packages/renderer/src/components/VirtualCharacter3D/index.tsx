import React, { useState, useEffect } from 'react';
import { Character3DCanvas } from './Character3DCanvas';
import { useCharacter3DStore } from '../../stores/character3DStore';
import { VirtualCharacter3DProps } from '../../types/character3d';

/**
 * 3D虚拟角色主组件
 * 集成所有3D功能的入口组件
 */
export const VirtualCharacter3D: React.FC<VirtualCharacter3DProps> = ({
  modelPath = '/assets/models/default-character.vrm',
  enableMCPIntegration = true,
  enableVoiceSync = true,
  enableControls = false,
  transparent = true,
  className = '',
  style = {},
  onReady,
  onError,
  ...props
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    isLoaded,
    isVisible,
    mcpConnected,
    setCurrentModel,
    setMCPConnected
  } = useCharacter3DStore();

  // 初始化3D角色系统
  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('VirtualCharacter3D: 开始初始化...');

        // 设置当前模型
        setCurrentModel(modelPath);

        // 初始化MCP集成
        if (enableMCPIntegration) {
          await initializeMCPIntegration();
        }

        setIsInitialized(true);
        console.log('VirtualCharacter3D: 初始化完成');

        // 触发就绪回调
        onReady?.();

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '初始化失败';
        setError(errorMessage);
        onError?.(errorMessage);
        console.error('VirtualCharacter3D: 初始化失败:', err);
      }
    };

    initialize();
  }, [modelPath, enableMCPIntegration]); // 移除store函数和callback依赖

  // 初始化MCP集成
  const initializeMCPIntegration = async (): Promise<void> => {
    try {
      console.log('VirtualCharacter3D: 初始化MCP集成...');

      // 检查MCP API是否可用
      if (typeof window !== 'undefined' && window.electronAPI?.mcp) {
        // 检查MCP服务状态
        const status = await window.electronAPI.mcp.getStatus();
        setMCPConnected(status.isRunning && status.mcpServerReady);

        console.log('VirtualCharacter3D: MCP状态:', status);
      } else {
        console.warn('VirtualCharacter3D: MCP API不可用');
      }
    } catch (err) {
      console.error('VirtualCharacter3D: MCP集成初始化失败:', err);
    }
  };

  // 处理模型加载成功
  const handleModelLoaded = (vrm: any) => {
    console.log('VirtualCharacter3D: 模型加载成功', vrm);

    // 触发模型加载事件
    window.dispatchEvent(new CustomEvent('character3d:modelLoaded', {
      detail: { vrm, modelPath }
    }));
  };

  // 处理错误
  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    onError?.(errorMessage);
    console.error('VirtualCharacter3D: 错误:', errorMessage);
  };

  // 如果出现错误，显示错误状态
  if (error) {
    return (
      <div
        className={`virtual-character-3d-error ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid rgba(255, 0, 0, 0.3)',
          borderRadius: '8px',
          color: '#cc0000',
          fontSize: '14px',
          textAlign: 'center',
          padding: '20px',
          ...style
        }}
      >
        <div>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
            3D角色加载失败
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  // 如果未初始化，显示加载状态
  if (!isInitialized) {
    return (
      <div
        className={`virtual-character-3d-loading ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.05)',
          borderRadius: '8px',
          ...style
        }}
      >
        <div style={{ textAlign: 'center', color: '#666' }}>
          <div style={{ marginBottom: '8px' }}>正在初始化3D系统...</div>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>
            {mcpConnected ? 'MCP已连接' : '等待MCP连接'}
          </div>
        </div>
      </div>
    );
  }

  // 如果不可见，返回空
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`virtual-character-3d ${className}`}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        ...style
      }}
      {...props}
    >
      <Character3DCanvas
        modelPath={modelPath}
        enableControls={enableControls}
        transparent={transparent}
        onModelLoaded={handleModelLoaded}
        onError={handleError}
        style={{ width: '100%', height: '100%' }}
      />

      {/* 状态指示器 */}
      {(process.env.NODE_ENV === 'development' || enableControls) && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000
        }}>
          <div>模型: {isLoaded ? '已加载' : '加载中'}</div>
          <div>MCP: {mcpConnected ? '已连接' : '断开'}</div>
        </div>
      )}
    </div>
  );
};

// 默认导出
export default VirtualCharacter3D;

// 同时导出相关类型和组件
export { Character3DCanvas } from './Character3DCanvas';
export { VRMCharacterController } from './VRMCharacterController';
export * from '../../types/character3d';
export { useCharacter3DStore } from '../../stores/character3DStore';