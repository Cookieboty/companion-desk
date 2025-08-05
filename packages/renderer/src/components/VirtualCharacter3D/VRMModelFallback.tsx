import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * VRM模型回退组件
 * 当没有实际VRM模型文件时，显示一个简单的3D占位符
 */
export const VRMModelFallback: React.FC<{
  scale?: number;
  position?: [number, number, number];
  onReady?: () => void;
}> = ({
  scale = 1,
  position = [0, 0, 0],
  onReady
}) => {
    const groupRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Mesh>(null);
    const bodyRef = useRef<THREE.Mesh>(null);

    useEffect(() => {
      console.log('VRMModelFallback: 初始化占位符模型');
      onReady?.();
    }, [onReady]);

    // 简单的呼吸动画
    useFrame((state) => {
      if (bodyRef.current) {
        const breathingScale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.02;
        bodyRef.current.scale.y = breathingScale;
      }

      if (headRef.current) {
        // 轻微的头部晃动
        headRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      }
    });

    return (
      <group ref={groupRef} scale={scale} position={position}>
        {/* 头部 */}
        <mesh ref={headRef} position={[0, 1.6, 0]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color="#ffdbac" />
        </mesh>

        {/* 身体 */}
        <mesh ref={bodyRef} position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.2, 0.15, 0.8, 8]} />
          <meshStandardMaterial color="#4a90e2" />
        </mesh>

        {/* 左臂 */}
        <mesh position={[-0.3, 1.0, 0]} rotation={[0, 0, -0.2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
          <meshStandardMaterial color="#ffdbac" />
        </mesh>

        {/* 右臂 */}
        <mesh position={[0.3, 1.0, 0]} rotation={[0, 0, 0.2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
          <meshStandardMaterial color="#ffdbac" />
        </mesh>

        {/* 左腿 */}
        <mesh position={[-0.1, 0.2, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.6, 6]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>

        {/* 右腿 */}
        <mesh position={[0.1, 0.2, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.6, 6]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>

        {/* 眼睛 */}
        <mesh position={[-0.05, 1.65, 0.12]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0.05, 1.65, 0.12]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>

        {/* 简单的光源 */}
        <pointLight position={[0, 2, 1]} intensity={0.5} color="#ffffff" />
        <ambientLight intensity={0.4} />
      </group>
    );
  };

export default VRMModelFallback;