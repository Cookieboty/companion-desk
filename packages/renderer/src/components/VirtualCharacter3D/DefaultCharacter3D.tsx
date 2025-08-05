import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 默认3D萌妹子角色
 * 程序化生成的可爱3D角色，具有动画和表情
 */
export const DefaultCharacter3D: React.FC<{
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
    const leftEyeRef = useRef<THREE.Mesh>(null);
    const rightEyeRef = useRef<THREE.Mesh>(null);
    const leftArmRef = useRef<THREE.Mesh>(null);
    const rightArmRef = useRef<THREE.Mesh>(null);
    const skirtRef = useRef<THREE.Mesh>(null);
    const hairRef = useRef<THREE.Mesh>(null);

    // 表情状态
    const [currentExpression, setCurrentExpression] = React.useState<'neutral' | 'happy' | 'surprised' | 'shy'>('neutral');
    const [blinkTimer, setBlinkTimer] = React.useState(0);

    useEffect(() => {
      console.log('DefaultCharacter3D: 初始化萌妹子角色');
      onReady?.();

      // 随机表情变化
      const expressionInterval = setInterval(() => {
        const expressions: typeof currentExpression[] = ['neutral', 'happy', 'surprised', 'shy'];
        const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
        setCurrentExpression(randomExpression);
      }, 5000);

      return () => clearInterval(expressionInterval);
    }, [onReady]);

    // 动画循环
    useFrame((state) => {
      if (!groupRef.current) return;

      const time = state.clock.elapsedTime;

      // 整体轻微摇摆
      groupRef.current.rotation.y = Math.sin(time * 0.3) * 0.02;
      groupRef.current.position.y = position[1] + Math.sin(time * 2) * 0.01;

      // 呼吸动画
      if (bodyRef.current) {
        const breathingScale = 1 + Math.sin(time * 3) * 0.015;
        bodyRef.current.scale.setScalar(breathingScale);
      }

      // 头部轻微点头
      if (headRef.current) {
        headRef.current.rotation.x = Math.sin(time * 1.5) * 0.05;
        headRef.current.rotation.y = Math.sin(time * 0.8) * 0.03;
      }

      // 手臂摆动
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.z = Math.sin(time * 2) * 0.1 + 0.2;
        rightArmRef.current.rotation.z = Math.sin(time * 2 + Math.PI) * 0.1 - 0.2;
      }

      // 裙子飘动
      if (skirtRef.current) {
        skirtRef.current.rotation.y = Math.sin(time * 1.5) * 0.02;
      }

      // 头发飘动
      if (hairRef.current) {
        hairRef.current.rotation.y = Math.sin(time * 1.2) * 0.03;
      }

      // 眨眼动画
      setBlinkTimer(prev => {
        const newTimer = prev + 0.016; // 假设60fps
        if (newTimer > 3 && leftEyeRef.current && rightEyeRef.current) {
          // 眨眼效果
          const blinkPhase = (newTimer - 3) * 20;
          if (blinkPhase < 1) {
            const scaleY = Math.abs(Math.sin(blinkPhase * Math.PI));
            leftEyeRef.current.scale.y = Math.max(0.1, scaleY);
            rightEyeRef.current.scale.y = Math.max(0.1, scaleY);
          } else {
            leftEyeRef.current.scale.y = 1;
            rightEyeRef.current.scale.y = 1;
            return Math.random() * 2 + 2; // 重置眨眼计时器
          }
        }
        return newTimer;
      });
    });

    // 根据表情调整眼睛形状
    const getEyeGeometry = () => {
      switch (currentExpression) {
        case 'happy':
          return new THREE.SphereGeometry(0.03, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.7);
        case 'surprised':
          return new THREE.SphereGeometry(0.04, 8, 8);
        case 'shy':
          return new THREE.SphereGeometry(0.02, 8, 6);
        default:
          return new THREE.SphereGeometry(0.03, 8, 8);
      }
    };

    return (
      <group ref={groupRef} scale={scale} position={position}>
        {/* 环境光 */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 1]} intensity={0.8} color="#fff8e1" />

        {/* 头部 */}
        <mesh ref={headRef} position={[0, 1.65, 0]}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshLambertMaterial color="#ffdbac" />
        </mesh>

        {/* 头发 */}
        <mesh ref={hairRef} position={[0, 1.75, -0.05]}>
          <sphereGeometry args={[0.22, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7]} />
          <meshLambertMaterial color="#8B4513" />
        </mesh>

        {/* 刘海 */}
        <mesh position={[0, 1.8, 0.15]}>
          <cylinderGeometry args={[0.15, 0.05, 0.1, 8]} />
          <meshLambertMaterial color="#8B4513" />
        </mesh>

        {/* 左眼 */}
        <mesh ref={leftEyeRef} position={[-0.06, 1.68, 0.14]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshLambertMaterial color="#2E2E2E" />
        </mesh>

        {/* 右眼 */}
        <mesh ref={rightEyeRef} position={[0.06, 1.68, 0.14]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshLambertMaterial color="#2E2E2E" />
        </mesh>

        {/* 眼睛高光 */}
        <mesh position={[-0.05, 1.69, 0.15]}>
          <sphereGeometry args={[0.01, 6, 6]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
        <mesh position={[0.07, 1.69, 0.15]}>
          <sphereGeometry args={[0.01, 6, 6]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>

        {/* 嘴巴 */}
        <mesh position={[0, 1.58, 0.14]}>
          <sphereGeometry args={[0.02, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshLambertMaterial color="#FF69B4" />
        </mesh>

        {/* 腮红 */}
        <mesh position={[-0.12, 1.62, 0.12]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshLambertMaterial color="#FFB6C1" transparent opacity={0.6} />
        </mesh>
        <mesh position={[0.12, 1.62, 0.12]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshLambertMaterial color="#FFB6C1" transparent opacity={0.6} />
        </mesh>

        {/* 身体 */}
        <mesh ref={bodyRef} position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.15, 0.12, 0.4, 12]} />
          <meshLambertMaterial color="#FF69B4" />
        </mesh>

        {/* 上衣装饰 */}
        <mesh position={[0, 1.2, 0.11]}>
          <cylinderGeometry args={[0.16, 0.13, 0.05, 12]} />
          <meshLambertMaterial color="#FFFFFF" />
        </mesh>

        {/* 左臂 */}
        <mesh ref={leftArmRef} position={[-0.22, 1.15, 0]} rotation={[0, 0, 0.2]}>
          <cylinderGeometry args={[0.04, 0.035, 0.35, 8]} />
          <meshLambertMaterial color="#ffdbac" />
        </mesh>

        {/* 右臂 */}
        <mesh ref={rightArmRef} position={[0.22, 1.15, 0]} rotation={[0, 0, -0.2]}>
          <cylinderGeometry args={[0.04, 0.035, 0.35, 8]} />
          <meshLambertMaterial color="#ffdbac" />
        </mesh>

        {/* 左手 */}
        <mesh position={[-0.25, 0.95, 0.05]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshLambertMaterial color="#ffdbac" />
        </mesh>

        {/* 右手 */}
        <mesh position={[0.25, 0.95, 0.05]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshLambertMaterial color="#ffdbac" />
        </mesh>

        {/* 裙子 */}
        <mesh ref={skirtRef} position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.25, 0.15, 0.3, 16]} />
          <meshLambertMaterial color="#FF1493" />
        </mesh>

        {/* 裙子装饰 */}
        <mesh position={[0, 0.85, 0]}>
          <torusGeometry args={[0.18, 0.015, 8, 16]} />
          <meshLambertMaterial color="#FFFFFF" />
        </mesh>

        {/* 左腿 */}
        <mesh position={[-0.08, 0.4, 0]}>
          <cylinderGeometry args={[0.05, 0.045, 0.5, 8]} />
          <meshLambertMaterial color="#ffdbac" />
        </mesh>

        {/* 右腿 */}
        <mesh position={[0.08, 0.4, 0]}>
          <cylinderGeometry args={[0.05, 0.045, 0.5, 8]} />
          <meshLambertMaterial color="#ffdbac" />
        </mesh>

        {/* 左鞋 */}
        <mesh position={[-0.08, 0.1, 0.04]}>
          <boxGeometry args={[0.08, 0.06, 0.12]} />
          <meshLambertMaterial color="#8B0000" />
        </mesh>

        {/* 右鞋 */}
        <mesh position={[0.08, 0.1, 0.04]}>
          <boxGeometry args={[0.08, 0.06, 0.12]} />
          <meshLambertMaterial color="#8B0000" />
        </mesh>

        {/* 蝴蝶结 */}
        <mesh position={[0, 1.85, -0.15]}>
          <boxGeometry args={[0.1, 0.04, 0.02]} />
          <meshLambertMaterial color="#FF1493" />
        </mesh>
        <mesh position={[0, 1.85, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
          <meshLambertMaterial color="#8B008B" />
        </mesh>

        {/* 爱心装饰 */}
        <mesh position={[0.15, 1.25, 0.05]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#FF69B4" transparent opacity={0.8} />
        </mesh>

        {/* 星星装饰 */}
        <mesh position={[-0.2, 1.8, 0.1]} rotation={[0, 0, Math.PI / 4]}>
          <cylinderGeometry args={[0.01, 0.01, 0.03, 4]} />
          <meshBasicMaterial color="#FFD700" />
        </mesh>

        {/* 表情相关的额外元素 */}
        {currentExpression === 'happy' && (
          <>
            <mesh position={[-0.1, 1.6, 0.14]}>
              <sphereGeometry args={[0.005, 6, 6]} />
              <meshBasicMaterial color="#FF69B4" />
            </mesh>
            <mesh position={[0.1, 1.6, 0.14]}>
              <sphereGeometry args={[0.005, 6, 6]} />
              <meshBasicMaterial color="#FF69B4" />
            </mesh>
          </>
        )}

        {currentExpression === 'shy' && (
          <mesh position={[0, 1.58, 0.14]}>
            <cylinderGeometry args={[0.015, 0.015, 0.01, 8]} />
            <meshBasicMaterial color="#FF69B4" transparent opacity={0.8} />
          </mesh>
        )}
      </group>
    );
  };

export default DefaultCharacter3D;