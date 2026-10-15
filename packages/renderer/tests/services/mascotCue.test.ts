import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CUE_META } from '../../src/services/cues/lines';
import { MascotCueService } from '../../src/services/cues/MascotCueService';
import { SfxService } from '../../src/services/sfx/SfxService';

vi.mock('../../src/mascot/characterVoice', () => ({
  speakForActiveCharacter: vi.fn(() => true),
}));
vi.mock('../../src/mascot/speechStop', () => ({
  stopAllSpeech: vi.fn(),
}));

describe('MascotCueService', () => {
  let cue: MascotCueService;

  beforeEach(() => {
    cue = new MascotCueService();
    cue.setGate({ voiceEnabled: true, voiceVolume: 0.8, quiet: false });
    cue.resetForTests();
  });

  afterEach(() => {
    cue.resetForTests();
  });

  it('respects voice disabled', () => {
    cue.setGate({ voiceEnabled: false });
    // still may play sfx; speech path skipped
    expect(cue.canSpeak()).toBe(false);
    const ok = cue.trigger('agent:done', { now: 1000 });
    // sfx may fail without AudioContext in happy-dom — either way no throw
    expect(typeof ok).toBe('boolean');
  });

  it('cools down same event', () => {
    cue.trigger('wave', { now: 0, speechOnly: true });
    expect(cue.wouldCooldown('wave', 1000)).toBe(true);
    expect(cue.wouldCooldown('wave', CUE_META.wave.cooldownMs + 1)).toBe(false);
  });

  it('higher priority can interrupt lower', async () => {
    const { stopAllSpeech } = await import('../../src/mascot/speechStop');
    cue.trigger('hover:face', { now: 0, speechOnly: true });
    cue.markSpeaking(1);
    cue.trigger('agent:permission', { now: 10, speechOnly: true, force: true });
    expect(stopAllSpeech).toHaveBeenCalled();
  });

  it('quiet gate blocks speech', () => {
    cue.setGate({ quiet: true });
    expect(cue.canSpeak()).toBe(false);
  });
});

describe('SfxService settings', () => {
  it('defaults enabled and respects mute/off', () => {
    const s = new SfxService();
    s.resetCooldowns();
    expect(s.getSettings().enabled).toBe(true);
    s.setSettings({ enabled: false });
    expect(s.isPlayable()).toBe(false);
    s.setSettings({ enabled: true, volume: 0.5 });
    s.setMuted(true);
    expect(s.isPlayable()).toBe(false);
    s.setMuted(false);
    expect(s.isPlayable()).toBe(true);
  });
});
