import { describe, expect, it, beforeEach } from 'vitest';

import { waifuSceneStore } from '../../src/ai/waifuSceneStore';

describe('waifuSceneStore', () => {
  beforeEach(() => {
    waifuSceneStore.reset();
  });

  it('starts with empty snapshot', () => {
    const snap = waifuSceneStore.get();
    expect(snap.currentModel).toBeNull();
    expect(snap.currentCostume).toBeNull();
    expect(snap.availableCostumes).toEqual([]);
    expect(snap.availableMotions).toEqual([]);
    expect(snap.updatedAt).toBe(0);
  });

  it('set writes and notifies listeners', () => {
    let received = 0;
    waifuSceneStore.subscribe(() => {
      received += 1;
    });
    const changed = waifuSceneStore.set(
      {
        currentModel: 'Pio',
        currentCostume: 'default',
        availableCostumes: ['a', 'b'],
        availableMotions: ['idle', 'shake'],
      },
      1000,
    );
    expect(changed).toBe(true);
    expect(received).toBe(1);
    const snap = waifuSceneStore.get();
    expect(snap.currentModel).toBe('Pio');
    expect(snap.availableCostumes).toEqual(['a', 'b']);
    expect(snap.updatedAt).toBe(1000);
  });

  it('does not notify when snapshot is structurally equal', () => {
    waifuSceneStore.set(
      {
        currentModel: 'A',
        currentCostume: null,
        availableCostumes: ['a'],
        availableMotions: ['idle'],
      },
      1000,
    );
    let calls = 0;
    waifuSceneStore.subscribe(() => {
      calls += 1;
    });
    const changed = waifuSceneStore.set(
      {
        currentModel: 'A',
        currentCostume: null,
        availableCostumes: ['a'],
        availableMotions: ['idle'],
      },
      2000,
    );
    expect(changed).toBe(false);
    expect(calls).toBe(0);
  });

  it('detects costume change', () => {
    waifuSceneStore.set(
      {
        currentModel: 'A',
        currentCostume: 'x',
        availableCostumes: ['x', 'y'],
        availableMotions: [],
      },
      1000,
    );
    const changed = waifuSceneStore.set(
      {
        currentModel: 'A',
        currentCostume: 'y',
        availableCostumes: ['x', 'y'],
        availableMotions: [],
      },
      2000,
    );
    expect(changed).toBe(true);
    expect(waifuSceneStore.get().currentCostume).toBe('y');
  });

  it('reset clears snapshot and notifies', () => {
    waifuSceneStore.set(
      {
        currentModel: 'A',
        currentCostume: null,
        availableCostumes: [],
        availableMotions: [],
      },
      500,
    );
    let received = -1;
    waifuSceneStore.subscribe((s) => {
      received = s.updatedAt;
    });
    waifuSceneStore.reset();
    expect(received).toBe(0);
    expect(waifuSceneStore.get().currentModel).toBeNull();
  });

  it('unsubscribe stops notifications', () => {
    let calls = 0;
    const off = waifuSceneStore.subscribe(() => {
      calls += 1;
    });
    waifuSceneStore.set(
      { currentModel: 'A', currentCostume: null, availableCostumes: [], availableMotions: [] },
      1,
    );
    off();
    waifuSceneStore.set(
      { currentModel: 'B', currentCostume: null, availableCostumes: [], availableMotions: [] },
      2,
    );
    expect(calls).toBe(1);
  });
});
