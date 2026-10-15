import path from 'node:path';

import { app } from 'electron';

import { SHERPA_MODEL_ID } from './manifest';
import { SherpaTtsService } from './SherpaTtsService';

export { SherpaTtsService, SherpaTtsError } from './SherpaTtsService';
export type { SherpaErrorCode } from './SherpaTtsService';
export * from './manifest';
export { locateModel, verifyModelDir } from './modelStore';
export { splitSentences } from './sentences';
export { encodeWavPcm16, concatSamples } from './wav';

let singleton: SherpaTtsService | null = null;

/**
 * 开发态（未打包）模型目录：
 * - 仓库同级 ../models/<id>（例如 /workspace/models/vits-zh-hf-theresa）
 * - 仓库内 models/<id>
 * - 本地已同步的 resources/tts-models/<id>（pnpm sync-tts-model 后）
 */
function devModelDirs(): string[] {
  if (app.isPackaged) return [];
  try {
    const appPath = app.getAppPath();
    // packages/electron → repo root → sibling models
    const electronRoot = path.resolve(appPath);
    const repoRoot = path.resolve(electronRoot, '../..');
    return [
      path.resolve(repoRoot, '../models', SHERPA_MODEL_ID),
      path.resolve(repoRoot, 'models', SHERPA_MODEL_ID),
      path.join(electronRoot, 'resources', 'tts-models', SHERPA_MODEL_ID),
    ];
  } catch {
    return [];
  }
}

export function getSherpaTtsService(): SherpaTtsService {
  if (!singleton) {
    singleton = new SherpaTtsService({
      resourcesRoot: () => {
        try {
          if (!app.isPackaged) return undefined;
          return path.join(process.resourcesPath, 'tts-models');
        } catch {
          return undefined;
        }
      },
      devDirs: devModelDirs,
      envDir: () => process.env.NOMI_SHERPA_TTS_MODEL_DIR?.trim() || undefined,
    });
  }
  return singleton;
}
