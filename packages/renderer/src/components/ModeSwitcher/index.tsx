import React, { useState, useEffect, useCallback } from 'react';
import { useCharacter3DStore } from '../../stores/character3DStore';
import { VirtualCharacter3D } from '../VirtualCharacter3D';
import Live2dWidget from '../Live2dWidget';
import type { ModelConfig } from '../../types/live2d';
import styles from './style.module.css';

/**
 * 模式切换器接口
 */
interface ModeSwitcherProps {
  defaultMode?: 'live2d' | '3d';
  enableModeToggle?: boolean;
  enablePerformanceMode?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onModeChange?: (mode: 'live2d' | '3d') => void;
  live2dConfig?: ModelConfig;
}

/**
 * 渲染模式类型
 */
type RenderMode = 'live2d' | '3d';

/**
 * 模式切换器组件
 * 支持Live2D和3D虚拟角色之间的智能切换
 */
export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({
  defaultMode = 'live2d',
  enableModeToggle = true,
  enablePerformanceMode = true,
  className = '',
  style = {},
  onModeChange,
  live2dConfig
}) => {
  const [currentMode, setCurrentMode] = useState<RenderMode>(defaultMode);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [performanceMode, setPerformanceMode] = useState<'auto' | 'manual'>('auto');
  const [lastSwitchTime, setLastSwitchTime] = useState(0);

  const {
    renderQuality,
    frameRate,
    memoryUsage,
    getPerformanceStats
  } = useCharacter3DStore();

  /**
   * 检查性能并自动切换模式
   */
  const checkPerformanceAndSwitch = useCallback(() => {
    if (!enablePerformanceMode || performanceMode !== 'auto') return;

    const stats = getPerformanceStats();
    const now = Date.now();

    // 防止频繁切换（至少间隔10秒）
    if (now - lastSwitchTime < 10000) return;

    // 性能低时切换到Live2D
    if (currentMode === '3d' && (stats.averageFPS < 25 || stats.averageMemory > 150)) {
      console.log('ModeSwitcher: 性能较低，自动切换到Live2D模式');
      handleModeSwitch('live2d', true);
    }

    // 性能恢复时可以切换回3D
    else if (currentMode === 'live2d' && stats.averageFPS > 40 && stats.averageMemory < 100) {
      console.log('ModeSwitcher: 性能恢复，可以切换到3D模式');
      // 这里可以显示提示，让用户选择是否切换回3D
    }
  }, [currentMode, enablePerformanceMode, performanceMode, getPerformanceStats, lastSwitchTime]);

  /**
   * 定期性能检查
   */
  useEffect(() => {
    if (!enablePerformanceMode) return;

    const interval = setInterval(checkPerformanceAndSwitch, 5000);
    return () => clearInterval(interval);
  }, [checkPerformanceAndSwitch, enablePerformanceMode]);

  /**
   * 处理模式切换
   */
  const handleModeSwitch = useCallback(async (newMode: RenderMode, isAutoSwitch = false) => {
    if (isTransitioning || newMode === currentMode) return;

    console.log(`ModeSwitcher: 切换模式 ${currentMode} → ${newMode}${isAutoSwitch ? ' (自动)' : ''}`);

    setIsTransitioning(true);
    setLastSwitchTime(Date.now());

    try {
      // 淡出效果
      await new Promise(resolve => setTimeout(resolve, 300));

      // 切换模式
      setCurrentMode(newMode);

      // 触发回调
      onModeChange?.(newMode);

      // 淡入效果
      await new Promise(resolve => setTimeout(resolve, 300));

      console.log(`ModeSwitcher: 模式切换完成 → ${newMode}`);
    } catch (error) {
      console.error('ModeSwitcher: 模式切换失败:', error);
    } finally {
      setIsTransitioning(false);
    }
  }, [currentMode, isTransitioning, onModeChange]);

  /**
   * 获取当前性能状态
   */
  const getPerformanceStatus = useCallback(() => {
    const stats = getPerformanceStats();

    if (stats.averageFPS < 20) return 'poor';
    if (stats.averageFPS < 30) return 'fair';
    if (stats.averageFPS < 50) return 'good';
    return 'excellent';
  }, [getPerformanceStats]);

  /**
   * 切换性能模式
   */
  const togglePerformanceMode = useCallback(() => {
    setPerformanceMode(prev => prev === 'auto' ? 'manual' : 'auto');
  }, []);

  return (
    <div className={`${styles.modeSwitcher} ${className}`} style={style}>
      {/* 控制面板 */}
      {enableModeToggle && (
        <div className={styles.controlPanel}>
          <div className={styles.modeButtons}>
            <button
              className={`${styles.modeButton} ${currentMode === 'live2d' ? styles.active : ''}`}
              onClick={() => handleModeSwitch('live2d')}
              disabled={isTransitioning}
            >
              Live2D
            </button>
            <button
              className={`${styles.modeButton} ${currentMode === '3d' ? styles.active : ''}`}
              onClick={() => handleModeSwitch('3d')}
              disabled={isTransitioning}
            >
              3D
            </button>
          </div>

          {enablePerformanceMode && (
            <div className={styles.performanceInfo}>
              <div className={styles.performanceStatus}>
                <span className={`${styles.statusDot} ${styles[getPerformanceStatus()]}`} />
                <span className={styles.statusText}>
                  {frameRate.toFixed(0)} FPS | {memoryUsage.toFixed(0)} MB
                </span>
              </div>

              <button
                className={`${styles.performanceButton} ${performanceMode === 'auto' ? styles.auto : ''}`}
                onClick={togglePerformanceMode}
                title={`性能模式: ${performanceMode === 'auto' ? '自动' : '手动'}`}
              >
                {performanceMode === 'auto' ? '🤖' : '👤'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 角色渲染区域 */}
      <div className={`${styles.characterContainer} ${isTransitioning ? styles.transitioning : ''}`}>
        {currentMode === 'live2d' && (
          <div className={styles.characterView}>
            <Live2dWidget config={live2dConfig || {
              waifuPath: '/assets/waifu-tips.json',
              cubism2Path: '/assets/live2d.min.js',
              tools: [
                'switch-model',
                'ai-chat',
                'info',
                'voice-settings',
                '3d-mode',
                'toggle-top',
                'quit'
              ],
              logLevel: 'warn',
              drag: true
            } as ModelConfig} />
          </div>
        )}

        {currentMode === '3d' && (
          <div className={styles.characterView}>
            <VirtualCharacter3D
              enableMCPIntegration={true}
              enableVoiceSync={true}
              enableControls={process.env.NODE_ENV === 'development'}
              transparent={true}
              onReady={() => console.log('ModeSwitcher: 3D角色就绪')}
              onError={(error) => console.error('ModeSwitcher: 3D角色错误:', error)}
            />
          </div>
        )}

        {/* 过渡效果遮罩 */}
        {isTransitioning && (
          <div className={styles.transitionOverlay}>
            <div className={styles.loadingSpinner} />
            <div className={styles.loadingText}>
              切换到 {currentMode === 'live2d' ? 'Live2D' : '3D'} 模式...
            </div>
          </div>
        )}
      </div>

      {/* 状态指示器 */}
      {process.env.NODE_ENV === 'development' && (
        <div className={styles.debugInfo}>
          <div>模式: {currentMode}</div>
          <div>质量: {renderQuality}</div>
          <div>性能: {getPerformanceStatus()}</div>
          <div>自动模式: {performanceMode === 'auto' ? '开启' : '关闭'}</div>
        </div>
      )}
    </div>
  );
};

export default ModeSwitcher;