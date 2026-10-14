export type LipSyncListener = (rms: number) => void;

class LipSyncStore {
  private rms = 0;
  private readonly listeners = new Set<LipSyncListener>();

  set(value: number): void {
    if (Number.isNaN(value)) return;
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    if (clamped === this.rms) return;
    this.rms = clamped;
    for (const l of this.listeners) {
      try {
        l(clamped);
      } catch {
        /* isolate listener error */
      }
    }
  }

  get(): number {
    return this.rms;
  }

  reset(): void {
    if (this.rms === 0) return;
    this.rms = 0;
    for (const l of this.listeners) {
      try {
        l(0);
      } catch {
        /* isolate listener error */
      }
    }
  }

  subscribe(l: LipSyncListener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const lipSyncStore = new LipSyncStore();
