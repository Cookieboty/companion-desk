import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { useCharacter3DStore } from '../../stores/character3DStore';
import { VRMCharacterControllerProps } from '../../types/character3d';
import VRMModelFallback from './VRMModelFallback';
import DefaultCharacter3D from './DefaultCharacter3D';

/**
 * VRM角色控制器组件
 * 负责VRM模型的加载、动画和交互控制
 */
export const VRMCharacterController: React.FC<VRMCharacterControllerProps> = ({
  modelPath,
  enablePhysics = true,
  enableExpressions = true,
  enableLookAt = true,
  scale = 1,
  position = [0, 0, 0],
  onModelLoaded,
  onAnimationUpdate,
  onError
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clockRef = useRef(new THREE.Clock());

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const { scene } = useThree();
  const {
    currentAnimation,
    currentExpression,
    isLoaded,
    setIsLoaded,
    updatePerformanceMetrics
  } = useCharacter3DStore();

  // 暂时禁用VRM加载，直接使用fallback
  // const gltf = useGLTF(modelPath || '/assets/models/default-character.vrm', true, true, (loader) => {
  //   loader.register((parser: any) => new VRMLoaderPlugin(parser) as any);
  // });
  const gltf: any = { scene: null, userData: null };

  // 初始化VRM模型
  useEffect(() => {
    const initializeVRM = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // 检查是否应该使用回退模型
        const shouldUseFallback = !modelPath || modelPath.includes('default-character.vrm') || !gltf.userData?.vrm;

        if (shouldUseFallback) {
          console.log('VRMCharacterController: 使用回退模型');
          setUseFallback(true);
          setIsLoaded(true);
          setIsLoading(false);
          onModelLoaded?.(null);
          return;
        }

        // 从GLTF中提取VRM
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) {
          console.log('VRMCharacterController: VRM数据无效，使用回退模型');
          setUseFallback(true);
          setIsLoaded(true);
          setIsLoading(false);
          onModelLoaded?.(null);
          return;
        }

        // 应用VRM修正
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        VRMUtils.removeUnnecessaryVertices(gltf.scene);

        // 设置模型变换
        vrm.scene.scale.setScalar(scale);
        vrm.scene.position.set(...position);

        // 初始化动画混合器
        if (!mixerRef.current) {
          mixerRef.current = new THREE.AnimationMixer(vrm.scene);
        }

        // 启用表情系统
        if (enableExpressions && vrm.expressionManager) {
          // 设置默认表情
          vrm.expressionManager.setValue('neutral', 1.0);
        }

        // 启用LookAt系统
        if (enableLookAt && vrm.lookAt) {
          vrm.lookAt.target = new THREE.Object3D();
          vrm.lookAt.target.position.set(0, 1.6, 5);
          scene.add(vrm.lookAt.target);
        }

        // 将VRM添加到场景
        if (groupRef.current) {
          groupRef.current.add(vrm.scene);
        }

        vrmRef.current = vrm;
        setIsLoaded(true);
        setIsLoading(false);

        // 触发回调
        onModelLoaded?.(vrm);

        console.log('VRM模型加载成功:', vrm);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
        console.error('VRM模型加载失败:', err);
      }
    };

    initializeVRM();
  }, [gltf, modelPath, scale, position, enableExpressions, enableLookAt, scene, setIsLoaded, onModelLoaded, onError]);

  // 播放动画
  useEffect(() => {
    if (!vrmRef.current || !mixerRef.current || !currentAnimation) return;

    const vrm = vrmRef.current;
    const mixer = mixerRef.current;

    // 清除当前动画
    mixer.stopAllAction();

    // 加载新动画
    const loadAnimation = async () => {
      try {
        // 这里应该根据动画名称加载相应的动画文件
        // 目前先使用默认的待机动画
        if (currentAnimation === 'idle') {
          // 实现简单的待机呼吸动画
          const breathingAnimation = createBreathingAnimation(vrm);
          if (breathingAnimation) {
            const action = mixer.clipAction(breathingAnimation);
            action.play();
          }
        }
      } catch (err) {
        console.error('加载动画失败:', err);
      }
    };

    loadAnimation();
  }, [currentAnimation]);

  // 更新表情
  useEffect(() => {
    if (!vrmRef.current?.expressionManager || !currentExpression) return;

    const expressionManager = vrmRef.current.expressionManager;

    // 重置所有表情
    Object.keys(expressionManager.expressionMap).forEach(key => {
      expressionManager.setValue(key, 0);
    });

    // 设置当前表情
    if (expressionManager.expressionMap[currentExpression]) {
      expressionManager.setValue(currentExpression, 1.0);
    }
  }, [currentExpression]);

  // 动画循环
  useFrame((state, delta) => {
    if (!vrmRef.current) return;

    const vrm = vrmRef.current;

    // 更新VRM系统
    vrm.update(delta);

    // 更新动画混合器
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    // 更新物理系统
    if (enablePhysics && vrm.springBoneManager) {
      vrm.springBoneManager.update(delta);
    }

    // 更新LookAt
    if (enableLookAt && vrm.lookAt) {
      // 简单的自动视线跟踪
      const time = state.clock.getElapsedTime();
      const target = vrm.lookAt.target;
      if (target) {
        target.position.x = Math.sin(time * 0.5) * 0.5;
        target.position.y = 1.6 + Math.sin(time * 0.3) * 0.1;
      }
    }

    // 触发动画更新回调
    onAnimationUpdate?.(vrm, delta);

    // 性能监控
    updatePerformanceMetrics({
      fps: 1 / delta,
      memoryMB: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0
    });
  });

  // 创建呼吸动画
  const createBreathingAnimation = (vrm: VRM): THREE.AnimationClip | null => {
    try {
      const tracks: THREE.KeyframeTrack[] = [];
      const duration = 4; // 4秒循环

      // 胸部呼吸动画
      const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
      if (spine) {
        const times = [0, duration * 0.5, duration];
        const values = [
          1, 1, 1,           // 初始缩放
          1.02, 1.01, 1,     // 吸气
          1, 1, 1            // 呼气
        ];

        const scaleTrack = new THREE.VectorKeyframeTrack(
          spine.name + '.scale',
          times,
          values
        );
        tracks.push(scaleTrack);
      }

      if (tracks.length > 0) {
        return new THREE.AnimationClip('breathing', duration, tracks);
      }
    } catch (err) {
      console.error('创建呼吸动画失败:', err);
    }
    return null;
  };

  // 清理资源
  useEffect(() => {
    return () => {
      if (vrmRef.current) {
        // 清理VRM资源
        VRMUtils.deepDispose(vrmRef.current.scene);
        vrmRef.current = null;
      }

      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <mesh>
        <boxGeometry args={[1, 2, 0.5]} />
        <meshBasicMaterial color="red" />
      </mesh>
    );
  }

  // 如果使用回退模型，显示萌妹子角色
  if (useFallback) {
    return (
      <DefaultCharacter3D
        scale={scale}
        position={position}
        onReady={() => {
          console.log('VRMCharacterController: 萌妹子角色就绪');
          onModelLoaded?.(null);
        }}
      />
    );
  }

  return <group ref={groupRef} />;
};

// 预加载常用模型
useGLTF.preload('/assets/models/default-character.vrm');

export default VRMCharacterController;