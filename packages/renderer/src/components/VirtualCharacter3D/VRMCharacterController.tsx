import { type VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { useFrame, useThree } from '@react-three/fiber';
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { DEFAULT_VRM_MODEL_PATH } from '../../config/vrm';
import { useCharacter3DStore } from '../../stores/character3DStore';
import { type VRMCharacterControllerProps } from '../../types/character3d';

import VRMModelFallback from './VRMModelFallback';

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
  onError,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  const [, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const { scene } = useThree();
  const { currentAnimation, currentExpression, isLoaded, setIsLoaded, updatePerformanceMetrics } =
    useCharacter3DStore();

  // 初始化VRM模型：GLTFLoader + VRMLoaderPlugin；加载失败才回退到程序化角色
  useEffect(() => {
    let cancelled = false;
    const url = modelPath || DEFAULT_VRM_MODEL_PATH;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    setIsLoading(true);
    setError(null);
    setUseFallback(false);
    loader
      .loadAsync(url)
      .then((gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (cancelled) {
          if (vrm) VRMUtils.deepDispose(vrm.scene);
          return;
        }
        if (!vrm) throw new Error('文件不包含 VRM 扩展');

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        // VRM 0.x 模型面向 -Z，统一转成 VRM 1.0 的朝向
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.traverse((o) => {
          o.frustumCulled = false;
        });
        vrm.scene.scale.setScalar(scale);
        vrm.scene.position.set(...position);
        mixerRef.current = new THREE.AnimationMixer(vrm.scene);

        if (enableExpressions && vrm.expressionManager) {
          vrm.expressionManager.setValue('neutral', 1.0);
        }
        if (enableLookAt && vrm.lookAt) {
          const target = new THREE.Object3D();
          target.position.set(0, 1.4, 5);
          scene.add(target);
          vrm.lookAt.target = target;
        }
        // 自然站姿：放下 T-pose 的手臂
        const l = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
        const r = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
        if (l) l.rotation.z = 1.2;
        if (r) r.rotation.z = -1.2;

        groupRef.current?.add(vrm.scene);
        vrmRef.current = vrm;
        setIsLoaded(true);
        setIsLoading(false);
        onModelLoaded?.(vrm);
        console.info('[perf] vrm-model-loaded');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('VRMCharacterController: VRM 加载失败，使用回退角色', err);
        setUseFallback(true);
        setIsLoaded(true);
        setIsLoading(false);
        onError?.(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      const vrm = vrmRef.current;
      if (vrm) {
        if (vrm.lookAt?.target) scene.remove(vrm.lookAt.target);
        groupRef.current?.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        vrmRef.current = null;
      }
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在模型路径变化时重新加载
  }, [modelPath]);

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
    Object.keys(expressionManager.expressionMap).forEach((key) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
      memoryMB: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
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
          1,
          1,
          1, // 初始缩放
          1.02,
          1.01,
          1, // 吸气
          1,
          1,
          1, // 呼气
        ];

        const scaleTrack = new THREE.VectorKeyframeTrack(spine.name + '.scale', times, values);
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

  if (error) {
    return (
      <mesh>
        {/* eslint-disable-next-line react/no-unknown-property -- react-three-fiber 的 JSX 元素属性 */}
        <boxGeometry args={[1, 2, 0.5]} />
        <meshBasicMaterial color="red" />
      </mesh>
    );
  }

  // 仅在 VRM 加载失败时显示占位角色
  if (useFallback) {
    return <VRMModelFallback scale={scale} position={position} />;
  }

  return <group ref={groupRef} />;
};

export default VRMCharacterController;
