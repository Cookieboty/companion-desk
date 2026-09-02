export interface WaifuSceneSnapshot {
  currentModel: string | null;
  currentCostume: string | null;
  availableCostumes: readonly string[];
  availableMotions: readonly string[];
  updatedAt: number;
}

export type WaifuSceneListener = (snapshot: WaifuSceneSnapshot) => void;

function emptySnapshot(): WaifuSceneSnapshot {
  return {
    currentModel: null,
    currentCostume: null,
    availableCostumes: [],
    availableMotions: [],
    updatedAt: 0,
  };
}

function shallowEqual(a: WaifuSceneSnapshot, b: WaifuSceneSnapshot): boolean {
  if (a.currentModel !== b.currentModel) return false;
  if (a.currentCostume !== b.currentCostume) return false;
  if (a.availableCostumes.length !== b.availableCostumes.length) return false;
  for (let i = 0; i < a.availableCostumes.length; i += 1) {
    if (a.availableCostumes[i] !== b.availableCostumes[i]) return false;
  }
  if (a.availableMotions.length !== b.availableMotions.length) return false;
  for (let i = 0; i < a.availableMotions.length; i += 1) {
    if (a.availableMotions[i] !== b.availableMotions[i]) return false;
  }
  return true;
}

class WaifuSceneStore {
  private snapshot: WaifuSceneSnapshot = emptySnapshot();
  private readonly listeners = new Set<WaifuSceneListener>();

  get(): WaifuSceneSnapshot {
    return this.snapshot;
  }

  set(next: Omit<WaifuSceneSnapshot, 'updatedAt'>, now: number = Date.now()): boolean {
    const candidate: WaifuSceneSnapshot = {
      currentModel: next.currentModel ?? null,
      currentCostume: next.currentCostume ?? null,
      availableCostumes: [...(next.availableCostumes ?? [])],
      availableMotions: [...(next.availableMotions ?? [])],
      updatedAt: now,
    };
    if (shallowEqual(candidate, this.snapshot) && this.snapshot.updatedAt !== 0) {
      return false;
    }
    this.snapshot = candidate;
    for (const l of this.listeners) {
      try {
        l(candidate);
      } catch {
        /* isolate listener error */
      }
    }
    return true;
  }

  reset(): void {
    if (this.snapshot.updatedAt === 0 && this.snapshot.currentModel === null) return;
    this.snapshot = emptySnapshot();
    for (const l of this.listeners) {
      try {
        l(this.snapshot);
      } catch {
        /* isolate listener error */
      }
    }
  }

  subscribe(l: WaifuSceneListener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const waifuSceneStore = new WaifuSceneStore();
