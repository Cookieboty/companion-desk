// @vitest-environment happy-dom
import { ModalHostContext, Modal } from '@nomi-ai/ui';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SettingsView,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from '../src/components/SettingsView';
import { AiChatContextProvider } from '../src/contexts/AiChatContext';

afterEach(cleanup);

const Harness = ({ onClose }: { onClose: () => void }) => {
  const [s, setS] = useState<SettingsSection>('privacy');
  return (
    <AiChatContextProvider>
      <SettingsView section={s} onSection={setS} onClose={onClose} />
    </AiChatContextProvider>
  );
};

describe('SettingsView', () => {
  it('lists every section and switches between them; Esc returns to chat', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<Harness onClose={onClose} />);
    for (const s of SETTINGS_SECTIONS) expect(getByTestId(`settings-nav-${s.id}`)).toBeTruthy();
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toContain('本机小模型（辅助）');
    expect(getByTestId('settings-privacy')).toBeTruthy();
    fireEvent.click(getByTestId('settings-nav-general'));
    expect(getByTestId('settings-nav-general').getAttribute('aria-current')).toBe('page');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Modal host modes', () => {
  it('inline: no overlay / close button; drawer: shows 在设置中打开', () => {
    const r1 = render(
      <ModalHostContext.Provider value={{ mode: 'inline' }}>
        <Modal open onClose={() => undefined} title="T" data-testid="m">
          body
        </Modal>
      </ModalHostContext.Provider>,
    );
    expect(r1.getByTestId('m').closest('.cd-modal-overlay')).toBeNull();
    expect(r1.queryByLabelText('关闭')).toBeNull();
    cleanup();
    const open = vi.fn();
    const r2 = render(
      <ModalHostContext.Provider value={{ mode: 'drawer', onOpenSettings: open }}>
        <Modal open onClose={() => undefined} title="T" data-testid="m">
          <Modal open onClose={() => undefined} title="child" data-testid="child">
            x
          </Modal>
        </Modal>
      </ModalHostContext.Provider>,
    );
    expect(r2.getByTestId('m').className).toContain('cd-modal--drawer');
    // 子对话框不继承宿主模式
    expect(r2.getByTestId('child').className).not.toContain('cd-modal--drawer');
    fireEvent.click(r2.getAllByTestId('open-in-settings')[0]!);
    expect(open).toHaveBeenCalled();
  });
});
