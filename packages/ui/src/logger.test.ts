// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, isVerboseLogging, setVerboseLogging } from './logger';

describe('createLogger', () => {
  afterEach(() => {
    setVerboseLogging(false);
    vi.restoreAllMocks();
  });

  it('silences debug/info when not verbose (production file://)', () => {
    setVerboseLogging(false);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = createLogger('t');
    expect(isVerboseLogging()).toBe(false);
    log.info('x');
    log.debug('y');
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    log.warn('w');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('prints info with scope when verbose', () => {
    setVerboseLogging(true);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    createLogger('scope').info('hello');
    expect(info).toHaveBeenCalled();
    expect(String(info.mock.calls[0][0])).toContain('scope');
  });
});
