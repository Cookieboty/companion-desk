import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SPINE_BELT, SPINE_CHEST } from '../../src/mascot/layeredRig';

/**
 * parts.json is the shared part / joint list consumed by the canvas rig AND the Rive builder.
 * It must stay in sync with manifest.json (placement) and brand-lock.json (art bytes).
 */
const MODEL = path.join(__dirname, '../../public/assets/models/sprite/nomi');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(MODEL, f), 'utf8'));
const parts = read('parts.json') as {
  rigSize: [number, number];
  parts: Array<{
    id: string;
    file: string;
    offset: [number, number];
    scale: number;
    sha256: string;
    brand: boolean;
    parent: string;
    z: number;
  }>;
  hands: Array<{ id: string; file: string; sha256: string }>;
  joints: Record<string, [number, number]>;
  spine: { belt: number; chest: number; bones: number; boneLength: number };
  chains: Record<string, { root: [number, number]; bones: number; tip: [number, number] }>;
};
const manifest = read('manifest.json').rig as {
  size: [number, number];
  layers: Record<string, number[]>;
  anchors: Record<string, [number, number]>;
  pivots: Record<string, [number, number]>;
};
const lock = read('brand-lock.json') as { files: Record<string, string> };

describe('parts.json (shared by canvas rig and Rive)', () => {
  it('matches manifest.json placement and the brand lock hashes', () => {
    expect(parts.rigSize).toEqual(manifest.size);
    for (const p of parts.parts) {
      const o = manifest.layers[p.id];
      expect(o, p.id).toBeTruthy();
      expect(p.offset, p.id).toEqual([o[0], o[1]]);
      expect(p.scale, p.id).toBe(o[2] ?? 1);
      expect(fs.existsSync(path.join(MODEL, p.file)), p.file).toBe(true);
      expect(lock.files[p.file], p.file).toBe(p.sha256);
    }
    for (const h of parts.hands) expect(lock.files[h.file], h.file).toBe(h.sha256);
  });

  it('every brand layer is a standalone part with a parent bone and a unique z', () => {
    const z = new Set(parts.parts.map((p) => p.z));
    expect(z.size).toBe(parts.parts.length);
    for (const id of [
      'head',
      'crown',
      'bangs',
      'hair-tail-l',
      'hair-tail-r',
      'body',
      'clip',
      'ribbon',
    ]) {
      const p = parts.parts.find((q) => q.id === id);
      expect(p?.brand, id).toBe(true);
      expect(p?.parent, id).toBeTruthy();
    }
  });

  it('joints come from the manifest and the spine matches the canvas bend constants', () => {
    expect(parts.joints.neck).toEqual(manifest.anchors.neck);
    expect(parts.joints.shoulderL).toEqual(manifest.pivots['arm-l']);
    expect(parts.joints.shoulderR).toEqual(manifest.pivots['arm-r']);
    const H = manifest.size[1];
    expect(parts.spine.belt).toBeCloseTo(H * SPINE_BELT, 1);
    expect(parts.spine.chest).toBeCloseTo(H * SPINE_CHEST, 1);
    for (const c of Object.values(parts.chains)) {
      expect(c.bones).toBeGreaterThanOrEqual(3);
      expect(c.tip[1]).toBeGreaterThan(c.root[1]);
    }
  });
});
