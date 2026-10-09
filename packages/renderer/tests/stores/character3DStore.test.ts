import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCharacter3DStore } from '../../src/stores/character3DStore';

describe('character3DStore (zustand 5 + immer middleware)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useCharacter3DStore.getState().reset();
  });

  it('applies immer draft mutations immutably', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const before = useCharacter3DStore.getState();
    before.addActiveTool('wave');
    before.addActiveTool('wave');
    const after = useCharacter3DStore.getState();
    expect(after.activeTools).toEqual(['wave']);
    expect(after).not.toBe(before);
    expect(before.activeTools).toEqual([]);
  });

  it('notifies subscribeWithSelector listeners only for the selected slice', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const seen: string[] = [];
    const unsub = useCharacter3DStore.subscribe(
      (s) => s.lastCommand,
      (cmd) => seen.push(cmd),
    );
    useCharacter3DStore.getState().setLastCommand('jump');
    useCharacter3DStore.getState().addActiveTool('dance');
    unsub();
    expect(seen).toEqual(['jump']);
  });
});
