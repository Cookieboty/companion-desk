import { describe, expect, it, vi } from 'vitest';

import { registerSpeechStopper, stopAllSpeech } from '../../src/mascot/speechStop';

describe('stopAllSpeech', () => {
  it('cancels system speech and every registered player', () => {
    const cancel = vi.fn();
    vi.stubGlobal('window', { speechSynthesis: { cancel } });
    const a = vi.fn();
    const off = registerSpeechStopper(a);
    stopAllSpeech();
    expect(cancel).toHaveBeenCalled();
    expect(a).toHaveBeenCalledTimes(1);
    off();
    stopAllSpeech();
    expect(a).toHaveBeenCalledTimes(1);
  });
});
