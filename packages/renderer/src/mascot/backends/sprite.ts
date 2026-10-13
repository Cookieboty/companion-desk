import type { RigManifest } from '../layeredRig';
import type { MascotBackend, MascotCapabilities } from '../MascotBackend';

export interface SpriteManifest {
  id: string;
  displayName: string;
  style: 'soft' | 'pixel' | string;
  license: string;
  author: string;
  source?: string;
  description?: string;
  expressions: Record<string, string>;
  blink?: string;
  mouthOpen?: string;
  thumbnail?: string;
  idleBobPx?: number;
  pixelScale?: number;
  tags?: string[];
  /** Optional pseudo-3D layered rig; when present SpriteCanvas animates layers instead of swapping plates. */
  rig?: RigManifest;
}

export interface SpriteBackend extends MascotBackend {
  readonly kind: 'sprite';
  /** Called each animation frame from SpriteCanvas */
  update(dt: number, elapsed: number): void;
  /** Current drawable state for the canvas */
  snapshot(): SpriteFrame;
  readonly manifest: SpriteManifest;
  readonly baseUrl: string;
}

export interface SpriteFrame {
  expressionUrl: string;
  mouthUrl: string | null;
  mouthOpacity: number;
  blinkOpacity: number;
  bobY: number;
  lookX: number;
  lookY: number;
  /** active expression name */
  expression: string;
  talking: boolean;
  /** raw lip-sync level 0..1 */
  mouth: number;
}

function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Expression-swapped 2D sprite backend (no Live2D).
 * Soft PNG plates or pixel pets — lip sync / blink / look are overlays + bob.
 */
export function createSpriteBackend(manifest: SpriteManifest, baseUrl: string): SpriteBackend {
  const url = (file: string) => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${base}${file}`;
  };
  const exprFile = (name: string) =>
    manifest.expressions[name] ??
    manifest.expressions.neutral ??
    Object.values(manifest.expressions)[0];

  let expression: string = 'neutral';
  let mouthTarget = 0;
  let mouth = 0;
  let blinkT = -1;
  let nextBlinkAt = 2.5 + Math.random() * 3;
  let lookX = 0;
  let lookY = 0;
  let lookGoalX = 0;
  let lookGoalY = 0;
  let talking = false;

  const backend: SpriteBackend = {
    kind: 'sprite',
    manifest,
    baseUrl,
    setExpression(name, _weight = 1) {
      if (name === 'blink') {
        blinkT = 0;
        return;
      }
      if (name === 'talking') {
        expression = 'neutral';
        return;
      }
      const n = name === 'neutral' ? 'neutral' : name;
      expression = exprFile(n) ? n : 'neutral';
      if (!manifest.expressions[expression]) expression = 'neutral';
      if (manifest.rig && ['happy', 'relaxed', 'sad', 'angry', 'surprised'].includes(n))
        expression = n;
    },
    setMouthOpen(value) {
      mouthTarget = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    },
    lookAt(x, y) {
      lookGoalX = Math.max(-1, Math.min(1, x));
      lookGoalY = Math.max(-1, Math.min(1, y));
    },
    blink() {
      blinkT = 0;
    },
    playMotion(_name) {
      // Sprites have no skeletal motions; treat as soft expression pulse
      if (_name === 'wave' || _name === 'cheer' || _name === 'clap') backend.setExpression('happy');
      else if (_name === 'shake' || _name === 'flinch') backend.setExpression('surprised');
      else if (_name === 'bow' || _name === 'think') backend.setExpression('relaxed');
      return true;
    },
    setTalking(t) {
      talking = t;
      if (!t) mouthTarget = 0;
    },
    capabilities(): MascotCapabilities {
      return {
        expressions: manifest.rig
          ? ['neutral', 'happy', 'relaxed', 'sad', 'angry', 'surprised']
          : Object.keys(manifest.expressions),
        lipSync: !!manifest.mouthOpen || !!manifest.rig,
        lookAt: true,
        blink: !!manifest.blink || !!manifest.rig,
        motions: ['wave', 'cheer', 'clap', 'shake', 'bow', 'think'],
      };
    },
    dispose() {
      /* images owned by canvas cache */
    },
    update(dt, t) {
      mouth = approach(mouth, talking ? Math.max(mouthTarget, 0.15) : mouthTarget, 14, dt);
      lookX = approach(lookX, lookGoalX, 8, dt);
      lookY = approach(lookY, lookGoalY, 8, dt);
      if (blinkT < 0 && t >= nextBlinkAt) blinkT = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        if (blinkT >= 0.16) {
          blinkT = -1;
          nextBlinkAt = t + 2.8 + Math.random() * 3.5;
        }
      }
    },
    snapshot(): SpriteFrame {
      const bob = Math.sin((performance.now() / 1000) * 1.4) * (manifest.idleBobPx ?? 3);
      let blinkOpacity = 0;
      if (blinkT >= 0) {
        const d = 0.16;
        blinkOpacity =
          blinkT < d / 2 ? blinkT / (d / 2) : Math.max(0, 1 - (blinkT - d / 2) / (d / 2));
      }
      const expr = expression in manifest.expressions || manifest.rig ? expression : 'neutral';
      return {
        expressionUrl: url(manifest.expressions[expr] ?? manifest.expressions.neutral ?? ''),
        mouthUrl: manifest.mouthOpen ? url(manifest.mouthOpen) : null,
        mouthOpacity: mouth,
        blinkOpacity,
        bobY: bob,
        lookX,
        lookY,
        expression: expr,
        talking,
        mouth,
      };
    },
  };
  return backend;
}

export async function loadSpriteManifest(
  manifestUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ manifest: SpriteManifest; baseUrl: string }> {
  const res = await fetchImpl(manifestUrl);
  if (!res.ok) throw new Error(`sprite manifest ${res.status}`);
  const manifest = (await res.json()) as SpriteManifest;
  if (!manifest?.expressions || typeof manifest.expressions !== 'object') {
    throw new Error('invalid sprite manifest');
  }
  const baseUrl = manifestUrl.replace(/\/[^/]*$/, '/');
  return { manifest, baseUrl };
}
