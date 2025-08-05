import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useProgress, Html } from '@react-three/drei';
import { VRMCharacterController } from './VRMCharacterController';
import { useCharacter3DStore } from '../../stores/character3DStore';
import { Character3DCanvasProps } from '../../types/character3d';

/**
 * 3D角色渲染画布组件
 * 基于React Three Fiber实现的高性能3D渲染
 */
export const Character3DCanvas: React.FC<Character3DCanvasProps> = ({
  modelPath,
  enableControls = false,
  transparent = true,
  className = '',
  onModelLoaded,
  onError,
  style,
  ...htmlProps
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    isLoaded,
    renderQuality,
    isVisible,
    setRenderQuality
  } = useCharacter3DStore();

  // 根据性能自动调整渲染质量
  useEffect(() => {
    const detectPerformance = () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

      if (!gl) {
        setRenderQuality('low');
        return;
      }

      const renderer = gl.getParameter(gl.RENDERER);
      const vendor = gl.getParameter(gl.VENDOR);

      // 简单的性能检测逻辑
      if (renderer.includes('Intel') && !renderer.includes('Iris')) {
        setRenderQuality('medium');
      } else if (renderer.includes('NVIDIA') || renderer.includes('AMD')) {
        setRenderQuality('high');
      } else {
        setRenderQuality('medium');
      }
    };

    detectPerformance();
  }, [setRenderQuality]);

  // 获取渲染配置
  const getRenderConfig = () => {
    switch (renderQuality) {
      case 'low':
        return {
          antialias: false,
          pixelRatio: Math.min(window.devicePixelRatio, 1),
          shadowMapSize: 512,
          toneMapping: false
        };
      case 'medium':
        return {
          antialias: true,
          pixelRatio: Math.min(window.devicePixelRatio, 1.5),
          shadowMapSize: 1024,
          toneMapping: true
        };
      case 'high':
        return {
          antialias: true,
          pixelRatio: window.devicePixelRatio,
          shadowMapSize: 2048,
          toneMapping: true
        };
      case 'ultra':
        return {
          antialias: true,
          pixelRatio: window.devicePixelRatio,
          shadowMapSize: 4096,
          toneMapping: true
        };
      default:
        return {
          antialias: true,
          pixelRatio: Math.min(window.devicePixelRatio, 1.5),
          shadowMapSize: 1024,
          toneMapping: true
        };
    }
  };

  const renderConfig = getRenderConfig();

  // 加载指示器组件
  const LoadingIndicator = () => {
    const { progress } = useProgress();

    return (
      <Html center>
        <div className="loading-indicator">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            加载3D模型中... {Math.round(progress)}%
          </div>
        </div>
      </Html>
    );
  };

  // 性能监控组件
  const PerformanceMonitor = () => {
    const { gl } = useThree();
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());

    useFrame(() => {
      frameCount.current++;

      if (frameCount.current % 60 === 0) {
        const now = performance.now();
        const fps = 60000 / (now - lastTime.current);
        lastTime.current = now;

        // 如果帧率过低，自动降低质量
        if (fps < 25 && renderQuality !== 'low') {
          console.log('检测到低帧率，自动降低渲染质量');
          setRenderQuality(renderQuality === 'ultra' ? 'high' :
            renderQuality === 'high' ? 'medium' : 'low');
        }
      }
    });

    return null;
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`character-3d-canvas ${className}`}
      style={style}
      {...htmlProps}
    >
      <Canvas
        ref={canvasRef}
        gl={{
          antialias: renderConfig.antialias,
          alpha: transparent,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance'
        }}
        dpr={renderConfig.pixelRatio}
        camera={{
          position: [0, 1.6, 3],
          fov: 50,
          near: 0.1,
          far: 1000
        }}
        shadows={renderQuality !== 'low'}
        style={{
          background: transparent ? 'transparent' : '#f0f0f0',
          width: '100%',
          height: '100%'
        }}
      >
        {/* 环境光 */}
        <ambientLight args={[0xffffff, 0.6]} />

        {/* 主光源 */}
        <directionalLight
          position={[10, 10, 5]}
          args={[0xffffff, 1]}
          castShadow={renderQuality !== 'low'}
        />

        {/* 补充光源 */}
        <pointLight position={[-10, 0, -20]} args={[0xffffff, 0.5]} />
        <pointLight position={[0, -10, 0]} args={[0xffffff, 0.3]} />

        {/* 性能监控 */}
        <PerformanceMonitor />

        {/* VRM角色控制器 */}
        {modelPath && (
          <Suspense fallback={<LoadingIndicator />}>
            <VRMCharacterController
              modelPath={modelPath}
              enablePhysics={renderQuality !== 'low'}
              enableExpressions={true}
              enableLookAt={true}
              onModelLoaded={onModelLoaded}
              onError={onError}
            />
          </Suspense>
        )}

        {/* 开发模式下的控制器 */}
        {enableControls && (
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={1}
            maxDistance={10}
            target={[0, 1, 0]}
          />
        )}
      </Canvas>

      {/* 内联样式 */}
      <style>{`
        .character-3d-canvas {
          width: 100%;
          height: 100%;
          position: relative;
        }

        .loading-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.8);
          border-radius: 10px;
          color: white;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top: 3px solid #fff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 10px;
        }

        .loading-text {
          font-size: 14px;
          text-align: center;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};