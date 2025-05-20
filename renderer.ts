// 声明全局类型
interface ElectronAPI {
  quit: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
  moveWindow: (mouseX: number, mouseY: number) => void;
}

// 扩展Window接口
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    initWidget: (config: any) => void;
  }
}

// 加载Live2D相关资源
function loadLive2D(): void {
  // 将Live2D小部件的资源路径设置为本地
  const live2d_path = './live2d-widget/dist/';

  // 加载CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = live2d_path + 'waifu.css';
  document.head.appendChild(link);

  // 加载JavaScript
  const script = document.createElement('script');
  script.src = live2d_path + 'live2d.min.js';
  document.body.appendChild(script);

  script.onload = () => {
    // 加载waifu-tips.js
    const waifuTips = document.createElement('script');
    waifuTips.src = live2d_path + 'waifu-tips.js';
    document.body.appendChild(waifuTips);

    waifuTips.onload = () => {
      // 初始化Live2D组件
      window.initWidget({
        waifuPath: live2d_path + 'waifu-tips.json',
        apiPath: 'https://fastly.jsdelivr.net/gh/fghrsh/live2d_api/',
        tools: ['hitokoto', 'switch-model', 'switch-texture', 'photo', 'info', 'quit'],
        dragable: true,
      });
    };
  };
}

// 设置拖动处理
let isPinned = false;

document.addEventListener('DOMContentLoaded', () => {
  // 初始化Live2D
  loadLive2D();

  // 设置关闭按钮
  const closeButton = document.getElementById('close-button');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.electronAPI.quit();
    });
  }

  // 设置置顶按钮
  const pinButton = document.getElementById('pin-button');
  if (pinButton) {
    pinButton.addEventListener('click', () => {
      isPinned = !isPinned;
      window.electronAPI.setAlwaysOnTop(isPinned);
      pinButton.textContent = isPinned ? '📍' : '📌';
    });
  }

  // 监听鼠标事件实现窗口拖动
  let isDragging = false;
  let mouseStartX = 0;
  let mouseStartY = 0;

  document.addEventListener('mousedown', (e) => {
    // 只有点击拖动区域才允许拖动
    if ((e.target as HTMLElement).id === 'app-region') {
      isDragging = true;
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const deltaX = e.clientX - mouseStartX;
      const deltaY = e.clientY - mouseStartY;
      window.electronAPI.moveWindow(deltaX, deltaY);
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
});

export { }; // 确保这是一个模块 