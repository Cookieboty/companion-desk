import { useCallback, useRef, useEffect } from 'react';
import { useCharacter3DStore } from '../stores/character3DStore';
import { VRM } from '@pixiv/three-vrm';

/**
 * VRM角色管理Hook
 * 提供VRM角色的加载、动画和交互控制
 */
export const useVRMCharacter = () => {
  const vrmRef = useRef<VRM | null>(null);

  const {
    isLoaded,
    currentModel,
    currentAnimation,
    currentExpression,
    isSpeaking,
    currentViseme,
    setIsLoaded,
    playAnimation,
    setExpression,
    setSpeaking,
    setCurrentModel
  } = useCharacter3DStore();

  /**
   * 设置VRM实例
   */
  const setVRM = useCallback((vrm: VRM | null) => {
    vrmRef.current = vrm;
    setIsLoaded(!!vrm);
  }, [setIsLoaded]);

  /**
   * 播放指定动画
   */
  const playCharacterAnimation = useCallback((animationName: string, options?: any) => {
    if (!vrmRef.current) {
      console.warn('useVRMCharacter: VRM未加载，无法播放动画');
      return;
    }

    playAnimation(animationName as any, options);
  }, [playAnimation]);

  /**
   * 设置角色表情
   */
  const setCharacterExpression = useCallback((expressionName: string, intensity = 1.0) => {
    if (!vrmRef.current?.expressionManager) {
      console.warn('useVRMCharacter: 表情管理器未初始化');
      return;
    }

    setExpression(expressionName as any, intensity);
  }, [setExpression]);

  /**
   * 设置说话状态和口型
   */
  const setCharacterSpeaking = useCallback((speaking: boolean, viseme = 'SIL') => {
    if (!vrmRef.current?.expressionManager) {
      console.warn('useVRMCharacter: 表情管理器未初始化');
      return;
    }

    setSpeaking(speaking, viseme as any);

    // 根据Viseme设置对应的口型表情
    const visemeExpressionMap: Record<string, string> = {
      'A': 'aa',
      'I': 'ih',
      'U': 'ou',
      'E': 'ee',
      'O': 'oh',
      'SIL': 'neutral'
    };

    const expressionName = visemeExpressionMap[viseme] || 'neutral';
    const expressionManager = vrmRef.current.expressionManager;

    if (expressionManager.expressionMap[expressionName]) {
      // 重置所有表情
      Object.keys(expressionManager.expressionMap).forEach(key => {
        expressionManager.setValue(key, 0);
      });

      // 设置当前口型
      if (speaking) {
        expressionManager.setValue(expressionName, 0.8);
      }
    }
  }, [setSpeaking]);

  /**
   * 设置视线目标
   */
  const setLookAtTarget = useCallback((x: number, y: number, z: number) => {
    if (!vrmRef.current?.lookAt?.target) {
      console.warn('useVRMCharacter: LookAt系统未初始化');
      return;
    }

    vrmRef.current.lookAt.target.position.set(x, y, z);
  }, []);

  /**
   * 加载新模型
   */
  const loadModel = useCallback((modelPath: string) => {
    setCurrentModel(modelPath);
  }, [setCurrentModel]);

  /**
   * 获取VRM实例
   */
  const getVRM = useCallback(() => vrmRef.current, []);

  /**
   * 获取角色信息
   */
  const getCharacterInfo = useCallback(() => {
    if (!vrmRef.current) return null;

    const vrm = vrmRef.current;
    return {
      name: (vrm.meta as any)?.name || 'Unknown Character',
      author: (vrm.meta as any)?.author || 'Unknown Author',
      version: (vrm.meta as any)?.version || '1.0',
      expressions: vrm.expressionManager ? Object.keys(vrm.expressionManager.expressionMap) : [],
      hasLookAt: !!vrm.lookAt,
      hasSpringBone: !!vrm.springBoneManager,
      humanoidBones: vrm.humanoid ? Object.keys(vrm.humanoid.humanBones) : []
    };
  }, []);

  /**
   * 重置角色状态
   */
  const resetCharacter = useCallback(() => {
    if (!vrmRef.current) return;

    // 重置表情
    if (vrmRef.current.expressionManager) {
      Object.keys(vrmRef.current.expressionManager.expressionMap).forEach(key => {
        vrmRef.current!.expressionManager!.setValue(key, 0);
      });
      if (vrmRef.current.expressionManager.expressionMap['neutral']) {
        vrmRef.current.expressionManager.setValue('neutral', 1.0);
      }
    }

    // 重置视线
    if (vrmRef.current.lookAt?.target) {
      vrmRef.current.lookAt.target.position.set(0, 1.6, 5);
    }

    // 重置pose（如果需要）
    vrmRef.current.scene.position.set(0, 0, 0);
    vrmRef.current.scene.rotation.set(0, 0, 0);
    vrmRef.current.scene.scale.setScalar(1);
  }, []);

  return {
    // 状态
    vrm: vrmRef.current,
    isLoaded,
    currentModel,
    currentAnimation,
    currentExpression,
    isSpeaking,
    currentViseme,

    // 方法
    setVRM,
    playCharacterAnimation,
    setCharacterExpression,
    setCharacterSpeaking,
    setLookAtTarget,
    loadModel,
    getVRM,
    getCharacterInfo,
    resetCharacter
  };
};

export default useVRMCharacter;