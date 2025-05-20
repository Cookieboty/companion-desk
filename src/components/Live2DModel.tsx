import React, { useEffect, useRef, useState } from 'react';
import './Live2DModel.css';

// 声明全局类型
declare global {
  interface Window {
    initWidget: (config: any) => void;
    loadlive2d: (canvasId: string, modelPath: string, callback?: () => void) => void;
    Live2D: any;
    live2DModels: any;
    waifuTips: {
      showMessage: (text: string, timeout: number) => void;
    };
    PIXI: any;
  }
}

// 组件属性定义
interface Live2DModelProps {
  modelPath: string;
  onLoad?: () => void;
}

const Live2DModel: React.FC<Live2DModelProps> = ({ modelPath, onLoad }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [messageText, setMessageText] = useState<string>('');
  const [showMessage, setShowMessage] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 动态加载Live2D相关资源
  useEffect(() => {
    // 加载CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'live2d-widget/dist/waifu.css';
    document.head.appendChild(link);

    // 加载JavaScript - Live2D核心库
    const script = document.createElement('script');
    script.src = 'live2d-widget/dist/live2d.min.js';
    document.body.appendChild(script);

    script.onload = () => {
      // 加载waifu-tips.js
      const waifuTips = document.createElement('script');
      waifuTips.src = 'live2d-widget/dist/waifu-tips.js';
      document.body.appendChild(waifuTips);

      waifuTips.onload = () => {
        initializeModel();
        setIsLoaded(true);
        onLoad && onLoad();
      };
    };

    return () => {
      // 清理加载的资源
      document.querySelectorAll('script[src*="live2d"]').forEach(el => el.remove());
      document.querySelectorAll('link[href*="waifu.css"]').forEach(el => el.remove());
    };
  }, [onLoad, modelPath]);

  // 初始化Live2D模型
  const initializeModel = () => {
    if (!window.initWidget) {
      // 如果脚本未正确加载，使用备用方法
      if (canvasRef.current && window.loadlive2d) {
        const modelUrl = `${modelPath}/get/?id=1-nipsilon`;

        // 尝试加载模型，如果远程API不可用，则使用本地模型
        window.loadlive2d('live2d-canvas', modelUrl, () => {
          console.log('模型加载成功');
        });
      }
      return;
    }

    // 使用live2d-widget的初始化方法
    window.initWidget({
      waifuPath: 'live2d-widget/dist/waifu-tips.json',
      apiPath: modelPath,
      cdnPath: modelPath,
      tools: ['hitokoto', 'switch-model', 'switch-texture', 'photo', 'info', 'quit'],
      canvasId: 'live2d-canvas',
      // 添加自定义消息
      messageDialog: true,
      messageTimer: 5000,
    });
  };

  // 显示气泡消息
  const showWaifuMessage = (text: string, duration: number = 4000) => {
    if (window.waifuTips && window.waifuTips.showMessage) {
      window.waifuTips.showMessage(text, duration);
      return;
    }

    // 备用消息显示方法
    setMessageText(text);
    setShowMessage(true);
    setTimeout(() => setShowMessage(false), duration);
  };

  // 模型交互事件
  useEffect(() => {
    if (!isLoaded) return;

    const greetings = [
      '你好，欢迎来到我的世界~',
      '嗨！你好呀！',
      '哇，你来啦！',
      '欢迎回来！'
    ];

    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    setTimeout(() => showWaifuMessage(randomGreeting), 1000);

    // 随机动作定时器
    const interval = setInterval(() => {
      if (Math.random() < 0.3) {
        const randomMsgs = [
          '好无聊啊，陪我玩玩吧~',
          '你知道吗？点击我的话我会很开心的！',
          '你在干嘛呢？',
          '我有什么能帮到你的吗？'
        ];
        const randomMsg = randomMsgs[Math.floor(Math.random() * randomMsgs.length)];
        showWaifuMessage(randomMsg);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [isLoaded]);

  // 鼠标事件处理
  const handleMouseClick = () => {
    const clickMessages = [
      '你好呀！有什么我能帮你的吗？',
      '哎呀！别戳我啦！',
      '喜欢我吗？',
      '这样点来点去是在玩什么游戏吗？'
    ];
    const randomMessage = clickMessages[Math.floor(Math.random() * clickMessages.length)];
    showWaifuMessage(randomMessage);
  };

  return (
    <div className="live2d-container" ref={containerRef}>
      <div
        className={`waifu-message ${showMessage ? 'show' : ''}`}
      >
        {messageText}
      </div>
      <div className="waifu-canvas-container">
        <canvas
          id="live2d-canvas"
          ref={canvasRef}
          width="280"
          height="250"
          onClick={handleMouseClick}
        />
      </div>
      <div className="waifu-tool" id="waifu-tool">
        {/* 工具按钮会由Live2D脚本自动填充 */}
      </div>
    </div>
  );
};

export default Live2DModel; 