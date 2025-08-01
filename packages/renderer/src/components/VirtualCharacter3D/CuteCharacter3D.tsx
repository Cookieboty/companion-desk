import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 超级可爱的3D卡通角色
 * 参考了知名动漫风格，打造萌系3D角色
 */
export const CuteCharacter3D: React.FC<{
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
    const hairRef = useRef<THREE.Group>(null);
    const earRef = useRef<THREE.Group>(null);

    // 表情状态
    const [currentExpression, setCurrentExpression] = React.useState<'neutral' | 'happy' | 'surprised' | 'shy' | 'wink'>('neutral');
    const [blinkTimer, setBlinkTimer] = React.useState(0);
    const [floatOffset, setFloatOffset] = React.useState(0);

    useEffect(() => {
      console.log('CuteCharacter3D: 初始化超萌3D角色');
      onReady?.();

      // 随机表情变化
      const expressionInterval = setInterval(() => {
        const expressions: typeof currentExpression[] = ['neutral', 'happy', 'surprised', 'shy', 'wink'];
        const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
        setCurrentExpression(randomExpression);
      }, 3000);

      return () => clearInterval(expressionInterval);
    }, [onReady]);

    // 动画循环
    useFrame((state) => {
      if (!groupRef.current) return;

      const time = state.clock.elapsedTime;

      // 优雅的悬浮动画
      const floatY = Math.sin(time * 1.5) * 0.02;
      groupRef.current.position.y = position[1] + floatY;
      groupRef.current.rotation.y = Math.sin(time * 0.4) * 0.05;

      // 呼吸动画
      if (bodyRef.current) {
        const breathingScale = 1 + Math.sin(time * 2.5) * 0.01;
        bodyRef.current.scale.setScalar(breathingScale);
      }

      // 头部轻柔摆动
      if (headRef.current) {
        headRef.current.rotation.x = Math.sin(time * 1.2) * 0.03;
        headRef.current.rotation.z = Math.sin(time * 0.8) * 0.02;
      }

      // 可爱的手臂摆动
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.z = Math.sin(time * 1.5) * 0.08 + 0.15;
        rightArmRef.current.rotation.z = Math.sin(time * 1.5 + Math.PI) * 0.08 - 0.15;
        leftArmRef.current.rotation.x = Math.sin(time * 2) * 0.05;
        rightArmRef.current.rotation.x = Math.sin(time * 2 + Math.PI) * 0.05;
      }

      // 裙子飘动
      if (skirtRef.current) {
        skirtRef.current.rotation.y = Math.sin(time * 1.8) * 0.03;
        skirtRef.current.scale.x = 1 + Math.sin(time * 2.2) * 0.01;
        skirtRef.current.scale.z = 1 + Math.sin(time * 2.2 + Math.PI) * 0.01;
      }

      // 头发飘动
      if (hairRef.current) {
        hairRef.current.rotation.y = Math.sin(time * 1.3) * 0.02;
        hairRef.current.rotation.z = Math.sin(time * 0.9) * 0.01;
      }

      // 猫耳摆动
      if (earRef.current) {
        earRef.current.rotation.z = Math.sin(time * 3) * 0.05;
      }

      // 眨眼动画
      setBlinkTimer(prev => {
        const newTimer = prev + 0.016;
        if (newTimer > 2.5 && leftEyeRef.current && rightEyeRef.current) {
          const blinkPhase = (newTimer - 2.5) * 15;
          if (blinkPhase < 1) {
            const scaleY = currentExpression === 'wink' ?
              (Math.abs(Math.sin(blinkPhase * Math.PI))) :
              Math.max(0.1, Math.abs(Math.sin(blinkPhase * Math.PI)));

            if (currentExpression === 'wink') {
              leftEyeRef.current.scale.y = Math.max(0.1, scaleY);
              rightEyeRef.current.scale.y = 1;
            } else {
              leftEyeRef.current.scale.y = scaleY;
              rightEyeRef.current.scale.y = scaleY;
            }
          } else {
            leftEyeRef.current.scale.y = 1;
            rightEyeRef.current.scale.y = 1;
            return Math.random() * 2 + 1.5;
          }
        }
        return newTimer;
      });
    });

    return (
      <group ref={groupRef} scale={scale} position={position}>
        {/* 环境光和方向光 */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 3, 2]} intensity={1.2} color="#fff5e6" />
        <pointLight position={[-2, 2, 2]} intensity={0.6} color="#ffb3e6" />

        {/* 头部 - 更大更圆润 */}
        <mesh ref={headRef} position={[0, 1.7, 0]}>
          <sphereGeometry args={[0.22, 20, 20]} />
          <meshLambertMaterial color="#fde5d3" />
        </mesh>

        {/* 可爱的猫耳朵 */}
        <group ref={earRef}>
          <mesh position={[-0.12, 1.88, 0.05]}>
            <coneGeometry args={[0.04, 0.12, 8]} />
            <meshLambertMaterial color="#ff69b4" />
          </mesh>
          <mesh position={[0.12, 1.88, 0.05]}>
            <coneGeometry args={[0.04, 0.12, 8]} />
            <meshLambertMaterial color="#ff69b4" />
          </mesh>
          {/* 耳朵内侧 */}
          <mesh position={[-0.12, 1.85, 0.08]}>
            <coneGeometry args={[0.02, 0.06, 6]} />
            <meshLambertMaterial color="#ffb3d9" />
          </mesh>
          <mesh position={[0.12, 1.85, 0.08]}>
            <coneGeometry args={[0.02, 0.06, 6]} />
            <meshLambertMaterial color="#ffb3d9" />
          </mesh>
        </group>

        {/* 超萌的双马尾 */}
        <group ref={hairRef}>
          {/* 主发束 */}
          <mesh position={[0, 1.82, -0.1]}>
            <sphereGeometry args={[0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <meshLambertMaterial color="#ff7f50" />
          </mesh>

          {/* 左马尾 */}
          <mesh position={[-0.25, 1.6, -0.05]} rotation={[0, 0, -0.3]}>
            <cylinderGeometry args={[0.06, 0.03, 0.3, 12]} />
            <meshLambertMaterial color="#ff7f50" />
          </mesh>
          <mesh position={[-0.32, 1.4, -0.02]} rotation={[0, 0, -0.5]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshLambertMaterial color="#ff7f50" />
          </mesh>

          {/* 右马尾 */}
          <mesh position={[0.25, 1.6, -0.05]} rotation={[0, 0, 0.3]}>
            <cylinderGeometry args={[0.06, 0.03, 0.3, 12]} />
            <meshLambertMaterial color="#ff7f50" />
          </mesh>
          <mesh position={[0.32, 1.4, -0.02]} rotation={[0, 0, 0.5]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshLambertMaterial color="#ff7f50" />
          </mesh>

          {/* 刘海 */}
          <mesh position={[0, 1.82, 0.18]}>
            <cylinderGeometry args={[0.18, 0.08, 0.08, 16]} />
            <meshLambertMaterial color="#ff7f50" />
          </mesh>
        </group>

        {/* 超大的萌萌眼睛 */}
        <mesh ref={leftEyeRef} position={[-0.08, 1.75, 0.16]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#2c3e50" />
        </mesh>
        <mesh ref={rightEyeRef} position={[0.08, 1.75, 0.16]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#2c3e50" />
        </mesh>

        {/* 眼睛高光 - 双层高光更萌 */}
        <mesh position={[-0.07, 1.76, 0.18]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.09, 1.76, 0.18]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[-0.065, 1.74, 0.18]}>
          <sphereGeometry args={[0.008, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.095, 1.74, 0.18]}>
          <sphereGeometry args={[0.008, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>

        {/* 可爱的小嘴巴 */}
        <mesh position={[0, 1.62, 0.16]}>
          <sphereGeometry args={[0.015, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshLambertMaterial color="#ff69b4" />
        </mesh>

        {/* 超萌腮红 */}
        <mesh position={[-0.15, 1.67, 0.14]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshLambertMaterial color="#ffb3d4" transparent opacity={0.7} />
        </mesh>
        <mesh position={[0.15, 1.67, 0.14]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshLambertMaterial color="#ffb3d4" transparent opacity={0.7} />
        </mesh>

        {/* 身体 - 萌萌哒服装 */}
        <mesh ref={bodyRef} position={[0, 1.15, 0]}>
          <cylinderGeometry args={[0.18, 0.15, 0.45, 16]} />
          <meshLambertMaterial color="#ff1493" />
        </mesh>

        {/* 可爱的蝴蝶结胸饰 */}
        <mesh position={[0, 1.3, 0.15]}>
          <boxGeometry args={[0.12, 0.05, 0.03]} />
          <meshLambertMaterial color="#ffd700" />
        </mesh>
        <mesh position={[0, 1.3, 0.15]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshLambertMaterial color="#ff69b4" />
        </mesh>

        {/* 超可爱的泡泡袖 */}
        <mesh ref={leftArmRef} position={[-0.25, 1.2, 0]} rotation={[0, 0, 0.15]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>
        <mesh ref={rightArmRef} position={[0.25, 1.2, 0]} rotation={[0, 0, -0.15]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>

        {/* 手臂 */}
        <mesh position={[-0.28, 1.0, 0]}>
          <cylinderGeometry args={[0.045, 0.04, 0.25, 10]} />
          <meshLambertMaterial color="#fde5d3" />
        </mesh>
        <mesh position={[0.28, 1.0, 0]}>
          <cylinderGeometry args={[0.045, 0.04, 0.25, 10]} />
          <meshLambertMaterial color="#fde5d3" />
        </mesh>

        {/* 可爱的小手 */}
        <mesh position={[-0.28, 0.85, 0.03]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshLambertMaterial color="#fde5d3" />
        </mesh>
        <mesh position={[0.28, 0.85, 0.03]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshLambertMaterial color="#fde5d3" />
        </mesh>

        {/* 超萌蓬蓬裙 */}
        <mesh ref={skirtRef} position={[0, 0.85, 0]}>
          <cylinderGeometry args={[0.3, 0.18, 0.35, 20]} />
          <meshLambertMaterial color="#ff1493" />
        </mesh>

        {/* 裙子装饰蕾丝 */}
        <mesh position={[0, 0.9, 0]}>
          <torusGeometry args={[0.22, 0.02, 8, 20]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.75, 0]}>
          <torusGeometry args={[0.26, 0.015, 8, 20]} />
          <meshLambertMaterial color="#ffb3e6" />
        </mesh>

        {/* 可爱的小腿 */}
        <mesh position={[-0.1, 0.45, 0]}>
          <cylinderGeometry args={[0.055, 0.05, 0.5, 10]} />
          <meshLambertMaterial color="#fde5d3" />
        </mesh>
        <mesh position={[0.1, 0.45, 0]}>
          <cylinderGeometry args={[0.055, 0.05, 0.5, 10]} />
          <meshLambertMaterial color="#fde5d3" />
        </mesh>

        {/* 超萌小皮鞋 */}
        <mesh position={[-0.1, 0.15, 0.05]}>
          <boxGeometry args={[0.1, 0.08, 0.15]} />
          <meshLambertMaterial color="#8b0000" />
        </mesh>
        <mesh position={[0.1, 0.15, 0.05]}>
          <boxGeometry args={[0.1, 0.08, 0.15]} />
          <meshLambertMaterial color="#8b0000" />
        </mesh>

        {/* 鞋子装饰 */}
        <mesh position={[-0.1, 0.18, 0.1]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshLambertMaterial color="#ffd700" />
        </mesh>
        <mesh position={[0.1, 0.18, 0.1]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshLambertMaterial color="#ffd700" />
        </mesh>

        {/* 头顶超大蝴蝶结 */}
        <mesh position={[0, 1.95, -0.1]}>
          <boxGeometry args={[0.15, 0.06, 0.03]} />
          <meshLambertMaterial color="#ffd700" />
        </mesh>
        <mesh position={[0, 1.95, -0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
          <meshLambertMaterial color="#ff69b4" />
        </mesh>

        {/* 飘浮的爱心特效 */}
        <mesh position={[0.2, 1.3, 0.1]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshBasicMaterial color="#ff69b4" transparent opacity={0.8} />
        </mesh>
        <mesh position={[-0.25, 1.5, 0.08]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshBasicMaterial color="#ffb3e6" transparent opacity={0.6} />
        </mesh>

        {/* 星星装饰 */}
        <mesh position={[0.3, 1.9, 0.1]} rotation={[0, 0, Math.PI / 4]}>
          <cylinderGeometry args={[0.008, 0.008, 0.03, 4]} />
          <meshBasicMaterial color="#ffd700" />
        </mesh>
        <mesh position={[-0.3, 1.7, 0.12]} rotation={[0, 0, Math.PI / 6]}>
          <cylinderGeometry args={[0.006, 0.006, 0.025, 4]} />
          <meshBasicMaterial color="#ff69b4" />
        </mesh>

        {/* 表情相关元素 */}
        {currentExpression === 'happy' && (
          <>
            {/* 开心的小脸红 */}
            <mesh position={[-0.12, 1.64, 0.15]}>
              <sphereGeometry args={[0.008, 6, 6]} />
              <meshBasicMaterial color="#ff69b4" />
            </mesh>
            <mesh position={[0.12, 1.64, 0.15]}>
              <sphereGeometry args={[0.008, 6, 6]} />
              <meshBasicMaterial color="#ff69b4" />
            </mesh>
          </>
        )}

        {currentExpression === 'shy' && (
          <mesh position={[0, 1.6, 0.16]}>
            <torusGeometry args={[0.02, 0.005, 4, 12]} />
            <meshBasicMaterial color="#ff69b4" transparent opacity={0.8} />
          </mesh>
        )}

        {currentExpression === 'surprised' && (
          <mesh position={[0, 1.6, 0.16]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshBasicMaterial color="#ff69b4" transparent opacity={0.6} />
          </mesh>
        )}
      </group>
    );
  };

export default CuteCharacter3D;