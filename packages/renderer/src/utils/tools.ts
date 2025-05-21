/**
 * @file Contains the configuration and functions for waifu tools.
 * @module tools
 */

import {
  fa_comment,
  fa_paper_plane,
  fa_user_circle,
  fa_street_view,
  fa_camera_retro,
  fa_info_circle,
  fa_xmark,
  fa_thumbtack
} from './icons.js';
import { showMessage, i18n } from './message.js';

interface Tools {
  /**
   * Key-value pairs of tools, where the key is the tool name.
   * @type {string}
   */
  [key: string]: {
    /**
     * Icon of the tool, usually an SVG string.
     * @type {string}
     */
    icon: string;
    /**
     * Callback function for the tool.
     * @type {() => void}
     */
    callback: (message: any) => void;
  };
}

/**
 * Waifu tools configuration.
 * @type {Tools}
 */
const tools: Tools = {
  'toggle-top': {
    icon: fa_thumbtack,
    callback: () => {
      // 获取electronAPI
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI || !electronAPI.setAlwaysOnTop) return;

      // 记录当前置顶状态
      const alwaysOnTop = localStorage.getItem('waifu-always-on-top') === 'true';

      // 切换置顶状态
      const newState = !alwaysOnTop;
      localStorage.setItem('waifu-always-on-top', String(newState));

      // 设置窗口置顶
      electronAPI.setAlwaysOnTop(newState);

      // 显示提示消息
      showMessage(
        newState ? '已设置为最前端显示！' : '已取消最前端显示！',
        3000,
        9
      );
    },
  },
  hitokoto: {
    icon: fa_comment,
    callback: async (template: string) => {
      // Add hitokoto.cn API
      const response = await fetch('https://v1.hitokoto.cn');
      const result = await response.json();
      const text = i18n(template, result.from, result.creator);
      showMessage(result.hitokoto, 6000, 9);
      setTimeout(() => {
        showMessage(text, 4000, 9);
      }, 6000);
    },
  },
  asteroids: {
    icon: fa_paper_plane,
    callback: () => {
      if (window.Asteroids) {
        if (!window.ASTEROIDSPLAYERS) window.ASTEROIDSPLAYERS = [];
        window.ASTEROIDSPLAYERS.push(new window.Asteroids());
      } else {
        const script = document.createElement('script');
        script.src =
          'https://fastly.jsdelivr.net/gh/stevenjoezhang/asteroids/asteroids.js';
        document.head.appendChild(script);
      }
    },
  },
  'switch-model': {
    icon: fa_user_circle,
    callback: () => { },
  },
  'switch-texture': {
    icon: fa_street_view,
    callback: () => { },
  },
  photo: {
    icon: fa_camera_retro,
    callback: (message: string | string[]) => {
      showMessage(message, 6000, 9);
      const canvas = document.getElementById('live2d') as HTMLCanvasElement;
      if (!canvas) return;
      const imageUrl = canvas.toDataURL();

      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = imageUrl;
      link.download = 'live2d-photo.png';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
  },
  info: {
    icon: fa_info_circle,
    callback: () => {
      open('https://github.com/stevenjoezhang/live2d-widget');
    },
  },
  quit: {
    icon: fa_xmark,
    callback: (message: string | string[]) => {
      localStorage.setItem('waifu-display', Date.now().toString());
      showMessage(message, 2000, 11);
      const waifu = document.getElementById('waifu');
      if (!waifu) return;
      waifu.style.bottom = '-500px';
      setTimeout(() => {
        waifu.style.display = 'none';
        const waifuToggle = document.getElementById('waifu-toggle');
        if (!waifuToggle) return;
        waifuToggle.classList.add('waifu-toggle-active');
      }, 3000);
    },
  },
};

export default tools;
export { Tools };
