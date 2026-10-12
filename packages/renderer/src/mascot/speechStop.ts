/** 语音打断：所有会出声的模块在这里登记停止函数 */
import { stopSoftSpeech } from './softSpeech';

const stoppers = new Set<() => void>();

export function registerSpeechStopper(fn: () => void): () => void {
  stoppers.add(fn);
  return () => stoppers.delete(fn);
}

export function stopAllSpeech(): void {
  stopSoftSpeech();
  for (const f of stoppers) {
    try {
      f();
    } catch {
      /* ignore */
    }
  }
}
