// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EndpointIcon } from '../src/components/EndpointIcon';
import { CONVERSATION_BACKENDS } from '../src/types/chat';

afterEach(() => cleanup());

describe('EndpointIcon', () => {
  it('renders an accessible icon with the endpoint name for every endpoint', () => {
    for (const b of CONVERSATION_BACKENDS) {
      const r = render(<EndpointIcon backend={b} />);
      const icon = r.getByTestId(`endpoint-icon-${b}`);
      const name = { nomi: 'Nomi', claude: 'Claude Code', codex: 'Codex', dsh: 'dsh' }[b];
      expect(icon.getAttribute('role')).toBe('img');
      expect(icon.getAttribute('aria-label')).toBe(name);
      expect(icon.querySelector('title')?.textContent).toBe(name);
      cleanup();
    }
  });

  it('decorative icons are hidden from assistive tech', () => {
    const r = render(<EndpointIcon backend="codex" decorative />);
    const icon = r.getByTestId('endpoint-icon-codex');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('aria-label')).toBeNull();
  });
});
