import React, { useEffect, useRef, useState } from 'react';
import Live2DModel from './components/Live2DModel';
import './App.css';
import './types/electron';

const App: React.FC = () => {
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const appRef = useRef<HTMLDivElement>(null);

  // 应用初始化时设置鼠标事件和键盘事件
  useEffect(() => {
    // 设置键盘快捷键
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'p') {
        // Alt+P 切换置顶状态
        togglePin();
      } else if (e.altKey && e.key === 'q') {
        // Alt+Q 关闭应用
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPinned]);

  // 调用电子窗口置顶API
  const togglePin = () => {
    const newPinState = !isPinned;
    setIsPinned(newPinState);
    window.electronAPI.setAlwaysOnTop(newPinState);
  };

  // 调用关闭应用API
  const handleClose = () => {
    window.electronAPI.quit();
  };

  // 窗口拖动处理
  useEffect(() => {
    let isDragging = false;
    let startX = 0, startY = 0;

    const onMouseDown = (e: MouseEvent) => {
      // 只在点击顶部拖动区域时才允许拖动
      if ((e.target as HTMLElement).id === 'drag-region') {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        window.electronAPI.moveWindow(deltaX, deltaY);
        startX = e.clientX;
        startY = e.clientY;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    // 添加事件监听器
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // 组件卸载时清理
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="app-container" ref={appRef}>
      <div id="drag-region" className="drag-region"></div>

      <div className="controls">
        <button
          className="control-button pin-button"
          onClick={togglePin}
          title={isPinned ? "取消置顶" : "置顶窗口"}
        >
          {isPinned ? '📍' : '📌'}
        </button>
        <button
          className="control-button close-button"
          onClick={handleClose}
          title="关闭"
        >
          ❌
        </button>
      </div>

      <Live2DModel
        modelPath="/live2d-widget/"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
};

export default App; 