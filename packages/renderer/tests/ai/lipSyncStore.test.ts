import { describe, expect, it, beforeEach } from 'vitest';

import { lipSyncStore } from '../../src/ai/lipSyncStore';

describe('lipSyncStore', () => {
  beforeEach(() => {
    lipSyncStore.reset();
  });

  it('clamps values into [0, 1]', () => {
    lipSyncStore.set(-1);
    expect(lipSyncStore.get()).toBe(0);
    lipSyncStore.set(2);
    expect(lipSyncStore.get()).toBe(1);
    lipSyncStore.set(0.42);
    expect(lipSyncStore.get()).toBeCloseTo(0.42);
  });

  it('ignores NaN', () => {
    lipSyncStore.set(0.5);
    lipSyncStore.set(Number.NaN);
    expect(lipSyncStore.get()).toBeCloseTo(0.5);
  });

  it('does not notify when value is unchanged', () => {
    let calls = 0;
    lipSyncStore.subscribe(() => {
      calls += 1;
    });
    lipSyncStore.set(0.3);
    lipSyncStore.set(0.3);
    lipSyncStore.set(0.3);
    expect(calls).toBe(1);
  });

  it('reset broadcasts 0 to listeners and clears state', () => {
    lipSyncStore.set(0.9);
    let received = -1;
    lipSyncStore.subscribe((v) => {
      received = v;
    });
    lipSyncStore.reset();
    expect(received).toBe(0);
    expect(lipSyncStore.get()).toBe(0);
  });

  it('unsubscribe stops notifications', () => {
    let calls = 0;
    const off = lipSyncStore.subscribe(() => {
      calls += 1;
    });
    lipSyncStore.set(0.1);
    off();
    lipSyncStore.set(0.5);
    expect(calls).toBe(1);
  });

  it('isolates listener errors', () => {
    lipSyncStore.subscribe(() => {
      throw new Error('boom');
    });
    let ok = 0;
    lipSyncStore.subscribe(() => {
      ok += 1;
    });
    expect(() => lipSyncStore.set(0.3)).not.toThrow();
    expect(ok).toBe(1);
  });
});
