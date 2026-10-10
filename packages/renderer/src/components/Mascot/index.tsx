import React, { Suspense, lazy, useMemo } from 'react';

import { MessageBubble } from '../MessageBubble/MessageBubble';
import { ToolBar } from '../ToolBar';

import { CanvasBoundary } from './CanvasBoundary';
import { Credits } from './Credits';
import { DesktopConfirm } from './DesktopConfirm';
import { InteractionSettings } from './InteractionSettings';
import { ModelPicker } from './ModelPicker';
import { MotionMenu } from './MotionMenu';
import styles from './style.module.css';

import { isAiIpcReady } from '@/ai/env';
import WaifuAgentBubbleBridge from '@/ai/WaifuAgentBubbleBridge';
import WaifuMascotSceneReporter from '@/ai/WaifuMascotSceneReporter';
import { useMascot } from '@/contexts/MascotContext';
import { useFileDropSummarize } from '@/hooks/useFileDropSummarize';
import { useMascotTips } from '@/hooks/useMascotTips';
import MascotDriver from '@/mascot/MascotDriver';

// three / VRM 体积较大：按需加载
const VirtualCharacter3D = lazy(() => import('../VirtualCharacter3D'));
const MascotAIBridge = lazy(() => import('@/mascot/MascotAIBridge'));

/**
 * 看板娘宿主：气泡 + 工具栏 + 角色画布（当前唯一后端：VRM）。
 * 必须位于 MascotProvider 内。
 */
export const MascotHost: React.FC = () => {
  const { currentModel } = useMascot();
  const aiReady = useMemo(() => isAiIpcReady(), []);
  useMascotTips();
  useFileDropSummarize('mascot-canvas');

  return (
    <div className={styles.root}>
      {aiReady && <WaifuAgentBubbleBridge />}
      {aiReady && (
        <Suspense fallback={null}>
          <MascotAIBridge />
        </Suspense>
      )}
      <MascotDriver />
      <WaifuMascotSceneReporter />
      <MessageBubble />
      <ToolBar />
      <ModelPicker />
      <MotionMenu />
      <Credits />
      <InteractionSettings />
      <DesktopConfirm />
      <div id="mascot-canvas" className={styles.stage} data-testid="mascot-canvas">
        {currentModel && (
          <CanvasBoundary>
            <Suspense fallback={null}>
              <VirtualCharacter3D
                modelPath={currentModel.path}
                modelConfig={currentModel.config}
                enableMCPIntegration
                enableVoiceSync
                enableControls={false}
                transparent
                style={{ transform: 'translateX(-40px)' }}
              />
            </Suspense>
          </CanvasBoundary>
        )}
      </div>
    </div>
  );
};

export default MascotHost;
