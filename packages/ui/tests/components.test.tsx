import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  IconButton,
  Input,
  Modal,
  Notice,
  Select,
  Switch,
  Tabs,
  ToastProvider,
  Tooltip,
  useToast,
} from '../src';

afterEach(cleanup);

describe('@ig-live/ui', () => {
  it('Button: variants map to classes, default type=button, passes data-testid', () => {
    render(
      <Button variant="primary" size="sm" data-testid="b">
        Go
      </Button>,
    );
    const b = screen.getByTestId('b');
    expect(b.className).toBe('cd-btn cd-btn--primary cd-btn--sm');
    expect(b.getAttribute('type')).toBe('button');
  });

  it('IconButton: label becomes aria-label and title', () => {
    render(<IconButton label="设置" icon="⚙" />);
    const b = screen.getByRole('button', { name: '设置' });
    expect(b.getAttribute('title')).toBe('设置');
    expect(b.className).toContain('cd-icon-btn');
  });

  it('Select renders options and stays a native select', () => {
    const onChange = vi.fn();
    render(
      <Select
        data-testid="s"
        value="a"
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
      />,
    );
    const s = screen.getByTestId('s') as HTMLSelectElement;
    expect(s.tagName).toBe('SELECT');
    expect(s.options).toHaveLength(2);
    expect(s.options[1].disabled).toBe(true);
  });

  it('Switch toggles via click with role=switch', () => {
    const Demo = () => {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onChange={setOn} label="启用" />;
    };
    render(<Demo />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('Modal: hidden when closed; Esc / overlay / close button call onClose', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open={false} onClose={onClose} title="T">
        body
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <Modal open onClose={onClose} title="T" data-testid="m">
        body
      </Modal>,
    );
    const dlg = screen.getByRole('dialog', { name: 'T' });
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    fireEvent.click(dlg); // 内容区点击不关闭
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(dlg.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('Tabs: click and arrow keys change selection', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        items={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('tab', { name: 'A' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onChange.mock.calls).toEqual([['b'], ['b']]);
  });

  it('Card / Badge / EmptyState / Notice render their slots', () => {
    render(
      <Card
        title="Title"
        subtitle="Sub"
        actions={<Badge tone="success">ok</Badge>}
        active
        data-testid="c"
      >
        <EmptyState title="空" description="暂无" />
        <Notice tone="danger">err</Notice>
      </Card>,
    );
    expect(screen.getByTestId('c').className).toContain('cd-card--active');
    expect(screen.getByText('ok').className).toBe('cd-badge cd-badge--success');
    expect(screen.getByText('暂无')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('err');
  });

  it('FormField associates label + hint with the control', () => {
    render(
      <FormField label="名称" hint="提示">
        <Input data-testid="i" />
      </FormField>,
    );
    const i = screen.getByLabelText('名称');
    expect(i).toBe(screen.getByTestId('i'));
    expect(document.getElementById(i.getAttribute('aria-describedby')!)!.textContent).toBe('提示');
  });

  it('Tooltip links bubble via aria-describedby', () => {
    render(
      <Tooltip content="提示文本">
        <button>btn</button>
      </Tooltip>,
    );
    const b = screen.getByRole('button', { name: 'btn' });
    expect(document.getElementById(b.getAttribute('aria-describedby')!)!.textContent).toBe(
      '提示文本',
    );
  });

  it('Toast: show + auto dismiss; useToast is a no-op outside provider', () => {
    vi.useFakeTimers();
    const Trigger = () => {
      const t = useToast();
      return (
        <button onClick={() => t.show('已保存', { tone: 'success', duration: 1000 })}>go</button>
      );
    };
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByRole('status').textContent).toContain('已保存');
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByRole('status')).toBeNull();
    vi.useRealTimers();
    cleanup();
    render(<Trigger />);
    expect(() => fireEvent.click(screen.getByText('go'))).not.toThrow();
  });
});
