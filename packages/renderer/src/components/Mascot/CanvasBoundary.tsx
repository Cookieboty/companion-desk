import React from 'react';

/**
 * 3D 画布错误边界：WebGL 不可用（驱动 / 虚拟显示）时只让角色区域降级，
 * 气泡、工具栏、桌面工具确认框等其余界面仍然可用。
 */
export class CanvasBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('[CanvasBoundary] 3D 渲染失败，已降级', error);
  }

  render(): React.ReactNode {
    if (this.state.failed) {
      return (
        <div
          data-testid="mascot-canvas-fallback"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 48,
          }}
        >
          🙂
        </div>
      );
    }
    return this.props.children;
  }
}
