import path from 'node:path';

import { app } from 'electron';

import { SHERPA_MODEL_ID } from './manifest';
import { SherpaTtsService } from './SherpaTtsService';

export { SherpaTtsService, SherpaTtsError } from './SherpaTtsService';
export type { SherpaErrorCode } from './SherpaTtsService';
export * from './manifest';
export { locateModel, installModel, verifyModelDir } from './modelStore';
export { splitSentences } from './sentences';
export { encodeWavPcm16, concatSamples } from './wav';

let singleton: SherpaTtsService | null = null;

/** 开发态（未打包）可直接指向仓库同级 models 目录；也可用 NOMI_SHERPA_TTS_MODEL_DIR 指定。 */
function devModelDirs(): string[] {
  if (app.isPackaged) return [];
  try {
    return [path.resolve(app.getAppPath(), '../../../models', SHERPA_MODEL_ID)];
  } catch {
    return [];
  }
}

export function getSherpaTtsService(): SherpaTtsService {
  if (!singleton) {
    singleton = new SherpaTtsService({
      userRoot: () => path.join(app.getPath('userData'), 'tts-models'),
      devDirs: devModelDirs,
      envDir: () => process.env.NOMI_SHERPA_TTS_MODEL_DIR?.trim() || undefined,
    });
  }
  return singleton;
}
