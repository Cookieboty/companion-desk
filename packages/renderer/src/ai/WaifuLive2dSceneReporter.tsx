import { useEffect, useMemo } from 'react';
import type { FC } from 'react';

import { waifuSceneStore } from './waifuSceneStore';

import { useLive2D } from '@/contexts/Live2DContext';

const DEFAULT_MOTIONS = ['idle', 'tap_body', 'tap_head', 'shake'] as const;

const WaifuLive2dSceneReporter: FC = () => {
  const { state } = useLive2D();

  const currentModel = useMemo(
    () => state.modelList[state.modelId],
    [state.modelList, state.modelId],
  );

  const costumes = useMemo(() => {
    if (!currentModel) return [];
    return currentModel.costumes && currentModel.costumes.length > 0
      ? currentModel.costumes
      : (currentModel.textures ?? []);
  }, [currentModel]);

  const currentCostume = useMemo(() => {
    if (!currentModel) return null;
    if (state.textureId <= 0) return 'default';
    return costumes[state.textureId - 1] ?? null;
  }, [currentModel, costumes, state.textureId]);

  useEffect(() => {
    if (!currentModel) {
      waifuSceneStore.reset();
      return;
    }
    waifuSceneStore.set({
      currentModel: currentModel.name,
      currentCostume,
      availableCostumes: costumes,
      availableMotions: [...DEFAULT_MOTIONS],
    });
  }, [currentModel, currentCostume, costumes]);

  useEffect(() => {
    return () => {
      waifuSceneStore.reset();
    };
  }, []);

  return null;
};

export default WaifuLive2dSceneReporter;
