import type { MascotBackend, MascotCapabilities, MotionOptions } from '../MascotBackend';

/** the motions the PoC .riv exposes as view-model triggers (see rive/nomi-poc, build-nomi-rive.py) */
export const RIVE_POC_MOTIONS = [
  'wave',
  'hello',
  'nod',
  'think',
  'pray',
  'cheer',
  'thumbs_up',
  'celebrate',
] as const;

/** the slice of Rive's ViewModelInstance we use (keeps the backend unit-testable without wasm) */
export interface RiveTriggerHost {
  trigger(name: string): { trigger(): void } | null;
}

/**
 * Experimental backend over a Rive state machine. Only body motions are wired: expression / mouth /
 * look-at are NOT driven yet (the PoC has no data-bound face params), so capabilities say so.
 */
export function createRiveBackend(host: () => RiveTriggerHost | null | undefined): MascotBackend {
  return {
    kind: 'rive',
    setExpression() {
      /* not wired in the PoC */
    },
    setMouthOpen() {
      /* not wired in the PoC */
    },
    lookAt() {
      /* not wired in the PoC */
    },
    blink() {
      /* the .riv blinks on its own idle layer */
    },
    playMotion(name: string, _opts?: MotionOptions): boolean {
      const id =
        name === 'random'
          ? RIVE_POC_MOTIONS[Math.floor(Math.random() * RIVE_POC_MOTIONS.length)]
          : name;
      if (!(RIVE_POC_MOTIONS as readonly string[]).includes(id)) return false;
      const t = host()?.trigger(id);
      if (!t) return false;
      t.trigger();
      return true;
    },
    setTalking() {
      /* not wired in the PoC */
    },
    capabilities(): MascotCapabilities {
      return {
        expressions: [],
        lipSync: false,
        lookAt: false,
        blink: true,
        motions: [...RIVE_POC_MOTIONS],
      };
    },
    dispose() {
      /* the canvas component owns the Rive instance */
    },
  };
}
