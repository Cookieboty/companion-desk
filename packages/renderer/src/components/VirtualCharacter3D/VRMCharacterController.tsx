import { type VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { DEFAULT_VRM_MODEL_PATH } from '../../config/vrm';
import { createVrmBackend, type VrmBackend } from '../../mascot/backends/vrm';
import { mascotRegistry } from '../../mascot/MascotBackend';
import { useCharacter3DStore } from '../../stores/character3DStore';
import { type VRMCharacterControllerProps } from '../../types/character3d';

import VRMModelFallback from './VRMModelFallback';

/**
 * VRM 角色控制器：加载模型，并把它包装成 MascotBackend（口型/表情/眨眼/视线/待机）挂到 mascotRegistry。
 */
export const VRMCharacterController: React.FC<VRMCharacterControllerProps> = ({
  modelPath,

  scale = 1,
  position = [0, 0, 0],
  onModelLoaded,
  onAnimationUpdate,
  onError,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const backendRef = useRef<VrmBackend | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const { scene } = useThree();
  const { currentExpression, setIsLoaded, updatePerformanceMetrics } = useCharacter3DStore();

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;
    const url = modelPath || DEFAULT_VRM_MODEL_PATH;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    setUseFallback(false);
    setIsLoaded(false);
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

        groupRef.current?.add(vrm.scene);
        vrmRef.current = vrm;
        const backend = createVrmBackend(vrm, scene);
        backendRef.current = backend;
        detach = mascotRegistry.attach(backend);
        setIsLoaded(true);
        onModelLoaded?.(vrm);
        console.info('[perf] mascot-model-loaded');
        console.info('[perf] vrm-model-loaded');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('VRMCharacterController: VRM 加载失败，使用占位角色', err);
        setUseFallback(true);
        setIsLoaded(true);
        onError?.(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      detach?.();
      backendRef.current?.dispose();
      backendRef.current = null;
      const vrm = vrmRef.current;
      if (vrm) {
        groupRef.current?.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        vrmRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在模型路径变化时重新加载
  }, [modelPath]);

  // store 里的表情（旧 3D 控制 API）也走 backend
  useEffect(() => {
    if (currentExpression) backendRef.current?.setExpression(currentExpression);
  }, [currentExpression]);

  useFrame((state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const dt = Math.min(delta, 1 / 20);
    backendRef.current?.update(dt, state.clock.getElapsedTime());
    vrm.update(dt);
    onAnimationUpdate?.(vrm, dt);
    updatePerformanceMetrics({
      fps: 1 / delta,
      memoryMB:
        ((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? 0) /
        1024 /
        1024,
    });
  });

  if (useFallback) {
    return <VRMModelFallback scale={scale} position={position} />;
  }
  return <group ref={groupRef} />;
};

export default VRMCharacterController;
