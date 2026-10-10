import fs from 'node:fs';
import path from 'node:path';

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectCredits } from '../../src/components/Mascot/Credits';
import { createVrmBackend } from '../../src/mascot/backends/vrm';
import { handleMascotCommand } from '../../src/mascot/commands';
import { directiveForEvent, motionForText } from '../../src/mascot/expressionDirector';
import { mascotRegistry, type MascotBackend } from '../../src/mascot/MascotBackend';
import { applyDirective, resetMoodForTests } from '../../src/mascot/mood';
import { MOTION_LABELS, parseMotionLibrary } from '../../src/mascot/motion/library';
import { MotionController, buildClip } from '../../src/mascot/motion/MotionController';

const LIB = parseMotionLibrary(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../public/assets/motions/motions.json'), 'utf8'),
  ),
);

/** 最小 VRM 替身：规范化骨骼挂在 scene 下，名字可被 AnimationMixer 解析 */
function fakeVrm(metaVersion: '0' | '1' = '0') {
  const scene = new THREE.Group();
  const bones = new Map<string, THREE.Object3D>();
  const vrm = {
    scene,
    meta: { metaVersion },
    humanoid: {
      getNormalizedBoneNode: (n: string) => {
        if (!bones.has(n)) {
          const o = new THREE.Object3D();
          o.name = `Normalized_${n}`;
          if (n === 'hips') o.position.set(0, 0.9, 0);
          scene.add(o);
          bones.set(n, o);
        }
        return bones.get(n)!;
      },
      normalizedRestPose: { hips: { position: [0, 0.9, 0] } },
    },
    expressionManager: undefined,
    lookAt: undefined,
  };
  return { vrm, bones };
}

describe('motion library', () => {
  it('ships CC0 Quaternius clips and original gestures', () => {
    const names = LIB.clips.map((c) => c.name);
    for (const n of [
      'idle',
      'talk',
      'dance',
      'jump',
      'wave',
      'nod',
      'shake',
      'think',
      'clap',
      'bow',
    ]) {
      expect(names).toContain(n);
    }
    for (const c of LIB.clips) {
      expect(['CC0-1.0', 'MIT']).toContain(c.license);
      expect(c.duration).toBeGreaterThan(0);
      if (c.name !== 'idle' && c.name !== 'talk') expect(MOTION_LABELS[c.name]).toBeTruthy();
    }
    expect(LIB.clips.find((c) => c.name === 'idle')?.source).toMatch(/Quaternius/);
  });

  it('rejects malformed clips', () => {
    const lib = parseMotionLibrary({
      clips: [{ name: 'bad', times: [0, 1], tracks: { head: [0, 0, 0] }, hips: [] }],
    });
    expect(lib.clips).toHaveLength(0);
    expect(() => parseMotionLibrary({})).toThrow();
  });
});

describe('buildClip', () => {
  it('flips x/z for VRM 0.x and fills untouched bones from idle', () => {
    const wave = LIB.clips.find((c) => c.name === 'wave')!;
    const idle = LIB.clips.find((c) => c.name === 'idle')!;
    const v0 = buildClip(fakeVrm('0').vrm as never, wave, idle);
    const v1 = buildClip(fakeVrm('1').vrm as never, wave, idle);
    const t0 = v0.tracks.find((t) => t.name === 'Normalized_rightUpperArm.quaternion')!;
    const t1 = v1.tracks.find((t) => t.name === 'Normalized_rightUpperArm.quaternion')!;
    expect(t0.values[4 * 3 + 0]).toBeCloseTo(-t1.values[4 * 3 + 0]);
    expect(t0.values[4 * 3 + 1]).toBeCloseTo(t1.values[4 * 3 + 1]);
    // 腿部由 idle 补齐
    expect(v0.tracks.some((t) => t.name === 'Normalized_leftUpperLeg.quaternion')).toBe(true);
    expect(v0.tracks.some((t) => t.name === 'Normalized_hips.position')).toBe(true);
  });
});

describe('MotionController', () => {
  it('loops idle, plays a gesture once, then returns to idle', () => {
    const { vrm, bones } = fakeVrm();
    const mc = new MotionController(vrm as never, LIB, { idleVarietyEvery: [999, 999] });
    const changes: Array<string | null> = [];
    mc.onChange((n) => changes.push(n));
    mc.update(0.5);
    expect(mc.playing()).toBeNull();
    expect(mc.play('wave')).toBe(true);
    expect(mc.playing()).toBe('wave');
    const arm = bones.get('rightUpperArm')!;
    for (let i = 0; i < 30; i++) mc.update(1 / 30);
    const raised = arm.quaternion.clone();
    for (let i = 0; i < 120; i++) mc.update(1 / 30);
    expect(mc.playing()).toBeNull();
    expect(changes).toEqual(['wave', null]);
    expect(raised.angleTo(arm.quaternion)).toBeGreaterThan(0.2);
    expect(mc.play('nope')).toBe(false);
    mc.dispose();
  });

  it('plays a random idle variation after the configured delay', () => {
    const { vrm } = fakeVrm();
    const mc = new MotionController(vrm as never, LIB, {
      idleVarietyEvery: [1, 1],
      random: () => 0,
    });
    for (let i = 0; i < 40; i++) mc.update(1 / 30);
    expect(['stretch', 'look_around']).toContain(mc.playing());
  });

  it('switches base loop for talking', () => {
    const { vrm } = fakeVrm();
    const mc = new MotionController(vrm as never, LIB);
    mc.setBase('talk');
    mc.update(0.1);
    expect(mc.play('random')).toBe(true);
    expect(mc.names()).toContain('talk');
  });
});

describe('VRM backend with motions', () => {
  it('exposes motions and delegates playMotion', () => {
    const { vrm } = fakeVrm();
    const b = createVrmBackend(vrm as never, new THREE.Scene());
    expect(b.playMotion('wave')).toBe(false);
    b.attachMotions(new MotionController(vrm as never, LIB));
    expect(b.capabilities().motions).toContain('wave');
    expect(b.playMotion('wave')).toBe(true);
    b.update(1 / 30, 0);
    b.dispose();
  });
});

describe('motion triggers', () => {
  afterEach(() => {
    resetMoodForTests();
    vi.useRealTimers();
  });

  it('maps text and events to motions', () => {
    expect(motionForText('你好呀')).toBe('wave');
    expect(motionForText('对不起，我做不到')).toBe('bow');
    expect(motionForText('太好了！🎉')).toBe('cheer');
    expect(motionForText('好的，没问题')).toBe('nod');
    expect(directiveForEvent({ kind: 'agent:step' })?.motion).toBe('think');
    expect(directiveForEvent({ kind: 'tool:executed', ok: false })?.motion).toBe('shake');
    expect(directiveForEvent({ kind: 'message:delta' })?.motion).toBeUndefined();
  });

  it('throttles automatic motions but not explicit commands', () => {
    vi.useFakeTimers();
    const playMotion = vi.fn(() => true);
    const setExpression = vi.fn();
    const detach = mascotRegistry.attach({
      kind: 'vrm',
      setExpression,
      playMotion,
      capabilities: () => ({
        expressions: [],
        lipSync: false,
        lookAt: false,
        blink: false,
        motions: [],
      }),
    } as unknown as MascotBackend);
    applyDirective({ expression: 'happy', holdMs: 0, motion: 'nod' }, 10_000);
    applyDirective({ expression: 'happy', holdMs: 0, motion: 'nod' }, 12_000);
    expect(playMotion).toHaveBeenCalledTimes(1);
    expect(handleMascotCommand({ type: 'motion', name: 'bow' })).toBe(true);
    expect(playMotion).toHaveBeenLastCalledWith('bow');
    expect(handleMascotCommand({ type: 'expression', name: 'Sad' })).toBe(true);
    expect(setExpression).toHaveBeenLastCalledWith('sad');
    expect(handleMascotCommand({ type: 'expression', name: 'F00' })).toBe(false);
    expect(handleMascotCommand(null)).toBe(false);
    detach();
  });
});

describe('credits', () => {
  it('lists every model author plus motions and the first-party icon', () => {
    const rows = collectCredits(
      [
        {
          name: 'a',
          displayName: 'A',
          author: 'Someone',
          license: 'CC-BY-4.0',
          source: 'https://x',
        },
      ],
      [
        { source: 'Quaternius Universal Animation Library: Idle_Loop', license: 'CC0-1.0' },
        { source: 'Companion Desk (original, procedural)', license: 'MIT' },
      ],
    );
    expect(rows.map((r) => r.key)).toEqual([
      'model-a',
      'motions-ual',
      'motions-own',
      'ui-icons',
      'icon',
    ]);
    expect(rows[0]).toMatchObject({ author: 'Someone', license: 'CC-BY-4.0' });
  });
});
